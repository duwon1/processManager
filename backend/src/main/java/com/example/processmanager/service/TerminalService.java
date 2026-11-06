package com.example.processmanager.service;

import com.example.processmanager.dto.TerminalInput;
import com.example.processmanager.dto.TerminalOutput;
import com.example.processmanager.dto.TerminalResize;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 터미널 세션 라우팅을 관리합니다.
 * 브라우저의 입력을 에이전트로, 에이전트의 출력을 브라우저로 중계합니다.
 */
@Service
public class TerminalService {

    private static final Logger log = LoggerFactory.getLogger(TerminalService.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final NodeMapper nodeMapper;
    private final UserMapper userMapper;

    // 입력·출력 경로에서 터미널 권한을 다시 확인하는 최소 간격입니다.
    // 키 입력마다 DB를 조회하면 입력이 밀려 화면에 늦게 뜨므로, 권한 회수 반영이 최대 이 시간만큼 늦어지는 것을 감수합니다.
    private static final long PERMISSION_RECHECK_MILLIS = 10_000L;

    // 세션별 노드 정보를 저장합니다. 명령 라우팅은 agentId 전용 topic으로 수행합니다.
    // ownerStompSessionId는 터미널을 연 브라우저 STOMP 세션으로, 해당 세션이 끊기면 터미널도 닫습니다.
    private record SessionInfo(Long nodeId, String nodeName, String agentId, String userEmail, String ownerStompSessionId) {}
    // 활성 터미널 세션 목록: terminalSessionId → SessionInfo
    private final Map<String, SessionInfo> activeSessions = new ConcurrentHashMap<>();
    // 터미널 세션별 마지막 권한 확인 시각(epoch millis)입니다.
    private final Map<String, Long> permissionCheckedAt = new ConcurrentHashMap<>();

    public TerminalService(SimpMessagingTemplate messagingTemplate, NodeMapper nodeMapper, UserMapper userMapper) {
        this.messagingTemplate = messagingTemplate;
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
    }

    // 터미널 세션을 열고 에이전트에 시작 명령을 보냅니다.
    // 같은 terminalSessionId를 다른 사용자가 덮어써 출력을 가로채지 못하도록, 기존 소유자가 다르면 거부합니다.
    public void openSession(String terminalSessionId, Long nodeId, String nodeName, String agentId,
                            String userEmail, String ownerStompSessionId, int cols, int rows, String shell) {
        SessionInfo newInfo = new SessionInfo(nodeId, nodeName, agentId, userEmail, ownerStompSessionId);
        SessionInfo stored = activeSessions.compute(terminalSessionId,
                (key, current) -> current == null || current.userEmail().equals(userEmail) ? newInfo : current);
        if (stored != newInfo) {
            throw new SecurityException("다른 사용자가 사용 중인 터미널 세션입니다.");
        }
        permissionCheckedAt.put(terminalSessionId, System.currentTimeMillis());
        String resolvedShell = normalizeShell(shell);

        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", "terminal-open");
        command.put("sessionId", terminalSessionId);
        command.put("nodeId", nodeId);
        command.put("agentId", agentId);
        command.put("nodeName", nodeName);
        command.put("cols", cols);
        command.put("rows", rows);
        command.put("shell", resolvedShell);
        messagingTemplate.convertAndSend(agentCommandDestination(agentId), (Object) command);
        log.info("터미널 세션 열기 요청: sessionId={}, nodeId={}, nodeName={}, shell={}",
                terminalSessionId, nodeId, nodeName, resolvedShell);
    }

    // 브라우저 키 입력을 에이전트로 전달합니다.
    public void sendInput(TerminalInput input, String userEmail) {
        SessionInfo info = activeSessions.get(input.sessionId());
        if (info == null || !info.userEmail().equals(userEmail)) {
            log.warn("활성 세션 없음: {}", input.sessionId());
            return;
        }
        if (!recheckPermissionIfDue(input.sessionId(), info)) {
            closeSession(input.sessionId(), userEmail);
            return;
        }
        Map<String, Object> command = Map.of(
                "type", "terminal-input",
                "sessionId", input.sessionId(),
                "nodeId", info.nodeId(),
                "agentId", info.agentId(),
                "nodeName", info.nodeName(),
                "data", input.data()
        );
        messagingTemplate.convertAndSend(agentCommandDestination(info.agentId()), (Object) command);
    }

    // 에이전트의 PTY 출력을 브라우저로 전달합니다.
    // 출력은 PTY 에코(타이핑 표시 포함)라 양이 많습니다. 권한은 세션 시작(openSession)과 구독(SUBSCRIBE) 시점에
    // 이미 검증됐고, 이후에는 매 청크 DB 조회 대신 PERMISSION_RECHECK_MILLIS 간격으로만 재확인해
    // 입력 없이 출력만 흐르는 세션도 권한 회수를 반영합니다.
    public void sendOutput(TerminalOutput output) {
        SessionInfo info = activeSessions.get(output.sessionId());
        if (info == null || !info.nodeId().equals(output.nodeId())) {
            return;
        }
        if (!recheckPermissionIfDue(output.sessionId(), info)) {
            closeSession(output.sessionId(), info.userEmail());
            return;
        }
        messagingTemplate.convertAndSend(
                "/topic/node." + output.nodeId() + ".terminal.output." + output.sessionId(),
                output
        );
    }

    // 터미널 크기 변경을 에이전트로 전달합니다.
    public void sendResize(TerminalResize resize, String userEmail) {
        SessionInfo info = activeSessions.get(resize.sessionId());
        if (info == null || !info.userEmail().equals(userEmail)) return;
        if (!hasTerminalPermission(info)) {
            closeSession(resize.sessionId(), userEmail);
            return;
        }
        Map<String, Object> command = Map.of(
                "type", "terminal-resize",
                "sessionId", resize.sessionId(),
                "nodeId", info.nodeId(),
                "agentId", info.agentId(),
                "nodeName", info.nodeName(),
                "cols", resize.cols(),
                "rows", resize.rows()
        );
        messagingTemplate.convertAndSend(agentCommandDestination(info.agentId()), (Object) command);
    }

    // 터미널 세션을 닫고 에이전트에 종료 명령을 보냅니다.
    public void closeSession(String terminalSessionId, String userEmail) {
        SessionInfo info = activeSessions.get(terminalSessionId);
        if (info != null && !info.userEmail().equals(userEmail)) return;
        info = activeSessions.remove(terminalSessionId);
        permissionCheckedAt.remove(terminalSessionId);
        if (info == null) return;
        Map<String, Object> command = Map.of(
                "type", "terminal-close",
                "sessionId", terminalSessionId,
                "nodeId", info.nodeId(),
                "agentId", info.agentId(),
                "nodeName", info.nodeName()
        );
        messagingTemplate.convertAndSend(agentCommandDestination(info.agentId()), (Object) command);
        log.info("터미널 세션 닫기: sessionId={}, nodeId={}", terminalSessionId, info.nodeId());
    }

    // 특정 노드의 모든 터미널 세션을 정리합니다. (에이전트 연결 해제 시 호출)
    public void cleanupNodeSessions(Long nodeId) {
        activeSessions.entrySet().removeIf(entry -> {
            if (entry.getValue().nodeId().equals(nodeId)) {
                // 브라우저에 세션 종료를 알립니다.
                messagingTemplate.convertAndSend(
                        "/topic/node." + nodeId + ".terminal.output." + entry.getKey(),
                        new TerminalOutput(entry.getKey(), nodeId, "\r\n\u001b[31m[연결이 끊어졌습니다]\u001b[0m\r\n")
                );
                permissionCheckedAt.remove(entry.getKey());
                return true;
            }
            return false;
        });
    }

    // 브라우저 STOMP 세션이 끊기면 그 세션이 연 터미널을 모두 닫고 에이전트에 종료 명령을 보냅니다.
    public void closeSessionsOpenedBy(String stompSessionId) {
        if (stompSessionId == null) {
            return;
        }
        activeSessions.forEach((terminalSessionId, info) -> {
            if (stompSessionId.equals(info.ownerStompSessionId())) {
                try {
                    closeSession(terminalSessionId, info.userEmail());
                } catch (RuntimeException e) {
                    log.warn("브라우저 연결 해제 시 터미널 정리 실패: sessionId={}, error={}", terminalSessionId, e.getMessage());
                }
            }
        });
    }

    // 마지막 확인 후 PERMISSION_RECHECK_MILLIS가 지났을 때만 DB로 권한을 다시 확인합니다.
    private boolean recheckPermissionIfDue(String terminalSessionId, SessionInfo info) {
        long now = System.currentTimeMillis();
        Long checkedAt = permissionCheckedAt.get(terminalSessionId);
        if (checkedAt != null && now - checkedAt < PERMISSION_RECHECK_MILLIS) {
            return true;
        }
        if (!hasTerminalPermission(info)) {
            return false;
        }
        permissionCheckedAt.put(terminalSessionId, now);
        return true;
    }

    private boolean hasTerminalPermission(SessionInfo info) {
        User user = userMapper.findByEmail(info.userEmail());
        return user != null && nodeMapper.findPermittedByUserIdAndNodeId(
                user.getId(),
                info.nodeId(),
                NodeAccessPermission.TERMINAL.name()
        ) != null;
    }

    private String agentCommandDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 터미널 명령을 전송할 수 없습니다.");
        }
        return "/topic/agent.command." + agentId;
    }

    private String normalizeShell(String shell) {
        String normalized = shell == null ? "" : shell.trim().toLowerCase(Locale.ROOT);
        if ("cmd".equals(normalized)) {
            return "cmd";
        }
        return "powershell";
    }
}
