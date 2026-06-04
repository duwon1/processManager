package com.example.processmanager.config;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import com.example.processmanager.security.JwtTokenProvider;
import com.example.processmanager.service.AgentRegistrationService;
import com.example.processmanager.service.NodeAccessPermission;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.TerminalService;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

    private final UserMapper userMapper;
    private final NodeMapper nodeMapper;
    private final NodeService nodeService;
    private final AgentRegistrationService agentRegistrationService;
    private final JwtTokenProvider jwtTokenProvider;
    private final TerminalService terminalService;
    // 네이티브 WebSocket 연결에서도 안전하게 끊김 처리를 하기 위해 sessionId별 nodeId를 별도 보관합니다.
    private final Map<String, NodeSessionInfo> sessionNodeMap = new ConcurrentHashMap<>();

    public WebSocketAuthInterceptor(UserMapper userMapper, NodeMapper nodeMapper, NodeService nodeService,
                                     AgentRegistrationService agentRegistrationService,
                                     JwtTokenProvider jwtTokenProvider, TerminalService terminalService) {
        this.userMapper = userMapper;
        this.nodeMapper = nodeMapper;
        this.nodeService = nodeService;
        this.agentRegistrationService = agentRegistrationService;
        this.jwtTokenProvider = jwtTokenProvider;
        this.terminalService = terminalService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;

        try {
            // 에이전트가 STOMP CONNECT 시 인증 처리
            if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                String accountToken = accessor.getFirstNativeHeader("account-token");
                String hostname     = accessor.getFirstNativeHeader("hostname");
                String osType       = accessor.getFirstNativeHeader("os-type");
                String agentId      = accessor.getFirstNativeHeader("agent-id");
                String agentSecret  = accessor.getFirstNativeHeader("agent-secret");
                String capabilities = accessor.getFirstNativeHeader("capabilities");

                // 브라우저 대시보드 연결(/ws)은 account-token/agent-secret 없이 들어옵니다.
                // jwt 헤더로 사용자를 식별하고 세션에 이메일을 저장해 STOMP 메시지 인증에 사용합니다.
                if ((accountToken == null || accountToken.isBlank()) && (agentSecret == null || agentSecret.isBlank())) {
                    String jwt = accessor.getFirstNativeHeader("jwt");
                    if (jwt != null && !jwt.isBlank() && jwtTokenProvider.validateToken(jwt)) {
                        String email = jwtTokenProvider.getEmailFromToken(jwt);
                        User user = userMapper.findByEmail(email);
                        if (user == null) {
                            throw new SecurityException("WebSocket 인증 사용자를 찾을 수 없습니다.");
                        }
                        if (accessor.getSessionAttributes() != null) {
                            accessor.getSessionAttributes().put("userEmail", email);
                            accessor.getSessionAttributes().put("userId", user.getId());
                        }
                        log.info("ℹ️ 브라우저 WebSocket 연결 허용: sessionId=" + accessor.getSessionId() + " / email=" + email);
                    } else {
                        throw new SecurityException("WebSocket JWT 인증이 필요합니다.");
                    }
                    return message;
                }

                // 노드 자동 등록 또는 상태 갱신
                String resolvedHostname = (hostname != null && !hostname.isBlank()) ? hostname : "unknown";
                String resolvedOsType   = (osType   != null && !osType.isBlank())   ? osType   : "Linux";
                Map<String, Object> resolvedCapabilities = parseCapabilities(capabilities);

                NodeService.AgentConnection connection;
                Long userId;
                String userEmail;

                if (agentSecret != null && !agentSecret.isBlank()) {
                    // 등록 완료 노드는 계정 토큰 없이 노드 전용 secret으로 재접속합니다.
                    connection = nodeService.connectRegisteredAgent(agentId, agentSecret, resolvedHostname, resolvedOsType);
                    Node connectedNode = connection.node();
                    userId = connectedNode.getUserId();
                    userEmail = "agent-secret";
                } else {
                    // 신규 등록/재설치는 1회용 설치 토큰으로만 허용합니다.
                    AgentRegistrationService.RegistrationResult registration =
                            agentRegistrationService.registerWithInstallToken(accountToken, agentId, resolvedHostname, resolvedOsType);
                    connection = registration.connection();
                    userId = registration.userId();
                    userEmail = registration.userEmail();
                }

                Node node = connection.node();

                // 네이티브 WebSocket 연결에서는 sessionAttributes가 비어 있거나 쓰기 불가능할 수 있어 별도 맵에 저장합니다.
                // 삭제 예약 노드는 id가 없을 수 있어 userId와 hostname도 함께 보관합니다.
                if (node != null && accessor.getSessionId() != null) {
                    sessionNodeMap.put(accessor.getSessionId(), new NodeSessionInfo(
                            node.getId(),
                            node.getName(),
                            userId,
                            node.getAgentId(),
                            connection.issuedAgentSecret(),
                            resolvedOsType,
                            resolvedCapabilities
                    ));
                }

                log.info("✅ 에이전트 인증 성공: " + userEmail
                        + " / sessionId=" + accessor.getSessionId()
                        + " / 노드=" + resolvedHostname
                        + " / osType=" + resolvedOsType
                        + " / auth=" + ((agentSecret != null && !agentSecret.isBlank()) ? "agent-secret" : "account-token"));
            }

            if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                validateSubscription(accessor);
            }

            // 에이전트가 명령 채널 구독을 마친 뒤 삭제 대기 명령을 재전송합니다.
            // CONNECT 단계에서 보내면 아직 구독 전이라 메시지가 유실될 수 있습니다.
            if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())
                    && isAgentCommandDestination(accessor.getDestination())) {
                String sessionId = accessor.getSessionId();
                NodeSessionInfo nodeInfo = sessionId != null ? sessionNodeMap.get(sessionId) : null;
                if (nodeInfo != null) {
                    nodeService.resendPendingUninstall(nodeInfo.userId(), nodeInfo.nodeName(), nodeInfo.agentId());
                }
            }

            // 에이전트 연결 해제 시 노드 상태를 오프라인으로 변경
            if (StompCommand.DISCONNECT.equals(accessor.getCommand())) {
                String sessionId = accessor.getSessionId();
                NodeSessionInfo nodeInfo = sessionId != null ? sessionNodeMap.remove(sessionId) : null;
                if (nodeInfo != null && nodeInfo.nodeId() != null) {
                    // 에이전트 연결 해제 시 해당 노드의 모든 터미널 세션을 정리합니다.
                    terminalService.cleanupNodeSessions(nodeInfo.nodeId());
                    // 삭제 대기 노드는 구버전 에이전트가 ACK 없이 종료했을 수 있어 DISCONNECT를 삭제 완료 신호로 봅니다.
                    if (nodeService.completeUninstallOnDisconnect(nodeInfo.userId(), nodeInfo.nodeId(), nodeInfo.nodeName())) {
                        log.info("🗑️ 삭제 대기 노드 연결 해제 → 최종 삭제: sessionId=" + sessionId + " / nodeId=" + nodeInfo.nodeId());
                        return message;
                    }
                    nodeService.disconnectAgent(nodeInfo.nodeId());
                    log.info("🔌 에이전트 연결 해제: sessionId=" + sessionId + " / nodeId=" + nodeInfo.nodeId());
                }
            }
        } catch (Exception e) {
            log.error("❌ WebSocket STOMP 처리 실패"
                    + " / command=" + accessor.getCommand()
                    + " / sessionId=" + accessor.getSessionId()
                    + " / hostname=" + accessor.getFirstNativeHeader("hostname")
                    + " / osType=" + accessor.getFirstNativeHeader("os-type")
                    + " / hasAccountToken=" + (accessor.getFirstNativeHeader("account-token") != null));
            log.error("WebSocket STOMP 처리 중 예외 발생", e);
            throw e;
        }

        return message;
    }

    // 수신한 STOMP 세션이 어떤 노드와 연결되어 있는지 조회할 때 사용합니다.
    public NodeSessionInfo getNodeSessionInfo(String sessionId) {
        return sessionNodeMap.get(sessionId);
    }

    private void validateSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/topic/")) {
            return;
        }

        String sessionId = accessor.getSessionId();
        NodeSessionInfo nodeInfo = sessionId != null ? sessionNodeMap.get(sessionId) : null;

        if (isAgentScopedDestination(destination, "/topic/agent.command.", nodeInfo)
                || isAgentScopedDestination(destination, "/topic/agent.secret.", nodeInfo)
                || isAgentScopedDestination(destination, "/topic/agent.sysinfo-request.", nodeInfo)
                || isAgentScopedDestination(destination, "/topic/agent.device-manager-request.", nodeInfo)
                || isAgentScopedDestination(destination, "/topic/agent.service-request.", nodeInfo)) {
            return;
        }

        // 기존 에이전트는 재설치 전까지 이 구독을 시도할 수 있습니다. 서버는 더 이상 이 채널들로 명령을 보내지 않습니다.
        if (nodeInfo != null && ("/topic/agent.command".equals(destination)
                || "/topic/agent.sysinfo-request".equals(destination))) {
            return;
        }

        if (destination.startsWith("/topic/node.")) {
            requireNodeSubscriptionAccess(accessor, destination);
            return;
        }

        if (destination.startsWith("/topic/user.")) {
            requireUserSubscriptionAccess(accessor, destination);
            return;
        }

        throw new SecurityException("허용되지 않은 WebSocket 구독입니다.");
    }

    private boolean isAgentCommandDestination(String destination) {
        return destination != null
                && (destination.startsWith("/topic/agent.command.") || "/topic/agent.command".equals(destination));
    }

    private boolean isAgentScopedDestination(String destination, String prefix, NodeSessionInfo nodeInfo) {
        if (!destination.startsWith(prefix) || nodeInfo == null || nodeInfo.agentId() == null) {
            return false;
        }
        String requestedAgentId = destination.substring(prefix.length());
        return requestedAgentId.equals(nodeInfo.agentId());
    }

    private void requireNodeSubscriptionAccess(StompHeaderAccessor accessor, String destination) {
        Long nodeId = parseScopedId(destination, "/topic/node.");
        NodeAccessPermission permission = permissionForNodeTopic(destination);
        User user = currentWebSocketUser(accessor);
        if (nodeMapper.findPermittedByUserIdAndNodeId(user.getId(), nodeId, permission.name()) == null) {
            throw new SecurityException("노드 구독 권한이 없습니다.");
        }
    }

    private NodeAccessPermission permissionForNodeTopic(String destination) {
        int separator = destination.indexOf('.', "/topic/node.".length());
        if (separator < 0 || separator + 1 >= destination.length()) {
            return NodeAccessPermission.VIEW_MONITORING;
        }
        String suffix = destination.substring(separator + 1);
        if (suffix.startsWith("terminal.")) {
            return NodeAccessPermission.TERMINAL;
        }
        if (suffix.equals("process-kill-result")) {
            return NodeAccessPermission.PROCESS_CONTROL;
        }
        if (suffix.equals("service-control-result")) {
            return NodeAccessPermission.SERVICE_CONTROL;
        }
        return NodeAccessPermission.VIEW_MONITORING;
    }

    private void requireUserSubscriptionAccess(StompHeaderAccessor accessor, String destination) {
        Long userId = parseScopedId(destination, "/topic/user.");
        User user = currentWebSocketUser(accessor);
        if (!user.getId().equals(userId)) {
            throw new SecurityException("사용자 구독 권한이 없습니다.");
        }
    }

    private Long parseScopedId(String destination, String prefix) {
        int end = destination.indexOf('.', prefix.length());
        if (end < 0) {
            throw new SecurityException("잘못된 WebSocket 구독 경로입니다.");
        }
        try {
            return Long.parseLong(destination.substring(prefix.length(), end));
        } catch (NumberFormatException e) {
            throw new SecurityException("잘못된 WebSocket 구독 경로입니다.");
        }
    }

    private User currentWebSocketUser(StompHeaderAccessor accessor) {
        Map<String, Object> attrs = accessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        if (email == null || email.isBlank()) {
            throw new SecurityException("WebSocket 인증이 필요합니다.");
        }
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new SecurityException("WebSocket 인증 사용자를 찾을 수 없습니다.");
        }
        return user;
    }

    // 에이전트가 보낸 capability JSON은 화면 기능 노출 판단용으로만 쓰며, 파싱 실패 시 빈 값으로 둡니다.
    private Map<String, Object> parseCapabilities(String rawCapabilities) {
        if (rawCapabilities == null || rawCapabilities.isBlank()) {
            return Collections.emptyMap();
        }
        Map<String, Object> parsed = new LinkedHashMap<>();
        String body = rawCapabilities.trim();
        if (!body.startsWith("{") || !body.endsWith("}")) {
            log.warn("에이전트 capability 형식 오류: {}", rawCapabilities);
            return Collections.emptyMap();
        }
        body = body.substring(1, body.length() - 1).trim();
        if (body.isBlank()) {
            return Collections.emptyMap();
        }

        // 현재 에이전트 capability는 {"terminal":true} 형태의 flat boolean JSON만 보냅니다.
        for (String pair : body.split(",")) {
            String[] parts = pair.split(":", 2);
            if (parts.length != 2) {
                continue;
            }
            String key = parts[0].trim().replace("\"", "");
            String value = parts[1].trim().replace("\"", "");
            if (!key.isBlank()) {
                parsed.put(key, "true".equalsIgnoreCase(value));
            }
        }
        return parsed.isEmpty() ? Collections.emptyMap() : parsed;
    }

    // 에이전트 연결 세션 정보를 간단히 전달하기 위한 레코드입니다.
    public record NodeSessionInfo(
            Long nodeId,
            String nodeName,
            Long userId,
            String agentId,
            String pendingAgentSecret,
            String osType,
            Map<String, Object> capabilities
    ) {
    }
}
