package com.example.processmanager.config;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.UserMapper;
import com.example.processmanager.security.JwtTokenProvider;
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

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final Logger log = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

    private final UserMapper userMapper;
    private final NodeService nodeService;
    private final JwtTokenProvider jwtTokenProvider;
    private final TerminalService terminalService;
    // 네이티브 WebSocket 연결에서도 안전하게 끊김 처리를 하기 위해 sessionId별 nodeId를 별도 보관합니다.
    private final Map<String, NodeSessionInfo> sessionNodeMap = new ConcurrentHashMap<>();

    public WebSocketAuthInterceptor(UserMapper userMapper, NodeService nodeService,
                                     JwtTokenProvider jwtTokenProvider, TerminalService terminalService) {
        this.userMapper = userMapper;
        this.nodeService = nodeService;
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

                // 브라우저 대시보드 연결(/ws)은 account-token 없이 들어옵니다.
                // jwt 헤더로 사용자를 식별하고 세션에 이메일을 저장해 STOMP 메시지 인증에 사용합니다.
                if (accountToken == null || accountToken.isBlank()) {
                    String jwt = accessor.getFirstNativeHeader("jwt");
                    if (jwt != null && !jwt.isBlank() && jwtTokenProvider.validateToken(jwt)) {
                        String email = jwtTokenProvider.getEmailFromToken(jwt);
                        if (accessor.getSessionAttributes() != null) {
                            accessor.getSessionAttributes().put("userEmail", email);
                        }
                        log.info("ℹ️ 브라우저 WebSocket 연결 허용: sessionId=" + accessor.getSessionId() + " / email=" + email);
                    } else {
                        log.info("ℹ️ 브라우저 WebSocket 연결 허용 (미인증): sessionId=" + accessor.getSessionId());
                    }
                    return message;
                }

                // 계정 토큰으로 사용자 조회
                User user = userMapper.findByAccountToken(accountToken);
                if (user == null) {
                    log.error("❌ WebSocket 인증 실패: 유효하지 않은 account-token (길이: {})", accountToken != null ? accountToken.length() : 0);
                    throw new IllegalArgumentException("유효하지 않은 account-token입니다.");
                }

                // 노드 자동 등록 또는 상태 갱신
                String resolvedHostname = (hostname != null && !hostname.isBlank()) ? hostname : "unknown";
                String resolvedOsType   = (osType   != null && !osType.isBlank())   ? osType   : "Linux";
                Node node = nodeService.connectAgent(user.getId(), resolvedHostname, resolvedOsType);

                // 네이티브 WebSocket 연결에서는 sessionAttributes가 비어 있거나 쓰기 불가능할 수 있어 별도 맵에 저장합니다.
                if (node != null && accessor.getSessionId() != null) {
                    sessionNodeMap.put(accessor.getSessionId(), new NodeSessionInfo(node.getId(), node.getName()));
                }

                log.info("✅ 에이전트 인증 성공: " + user.getEmail()
                        + " / sessionId=" + accessor.getSessionId()
                        + " / 노드=" + resolvedHostname
                        + " / osType=" + resolvedOsType);
            }

            // 에이전트 연결 해제 시 노드 상태를 오프라인으로 변경
            if (StompCommand.DISCONNECT.equals(accessor.getCommand())) {
                String sessionId = accessor.getSessionId();
                NodeSessionInfo nodeInfo = sessionId != null ? sessionNodeMap.remove(sessionId) : null;
                if (nodeInfo != null) {
                    // 에이전트 연결 해제 시 해당 노드의 모든 터미널 세션을 정리합니다.
                    terminalService.cleanupNodeSessions(nodeInfo.nodeId());
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

    // 에이전트 연결 세션 정보를 간단히 전달하기 위한 레코드입니다.
    public record NodeSessionInfo(Long nodeId, String nodeName) {
    }
}
