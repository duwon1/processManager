package com.example.processmanager.service;

import com.example.processmanager.dto.TerminalInput;
import com.example.processmanager.dto.TerminalOutput;
import com.example.processmanager.dto.TerminalResize;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

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

    // 세션별 노드 정보를 저장합니다. (에이전트가 nodeName으로 자기 명령을 필터링)
    private record SessionInfo(Long nodeId, String nodeName, String agentId, String userEmail) {}
    // 활성 터미널 세션 목록: terminalSessionId → SessionInfo
    private final Map<String, SessionInfo> activeSessions = new ConcurrentHashMap<>();

    public TerminalService(SimpMessagingTemplate messagingTemplate, NodeMapper nodeMapper, UserMapper userMapper) {
        this.messagingTemplate = messagingTemplate;
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
    }

    // 터미널 세션을 열고 에이전트에 시작 명령을 보냅니다.
    public void openSession(String terminalSessionId, Long nodeId, String nodeName, String agentId,
                            String userEmail, int cols, int rows) {
        // nodeId로 nodeName을 조회하여 에이전트가 자기 명령을 필터링할 수 있게 합니다.
        activeSessions.put(terminalSessionId, new SessionInfo(nodeId, nodeName, agentId, userEmail));

        Map<String, Object> command = Map.of(
                "type", "terminal-open",
                "sessionId", terminalSessionId,
                "nodeId", nodeId,
                "nodeName", nodeName,
                "cols", cols,
                "rows", rows
        );
        messagingTemplate.convertAndSend(agentCommandDestination(agentId), (Object) command);
        log.info("터미널 세션 열기 요청: sessionId={}, nodeId={}, nodeName={}", terminalSessionId, nodeId, nodeName);
    }

    // 브라우저 키 입력을 에이전트로 전달합니다.
    public void sendInput(TerminalInput input, String userEmail) {
        SessionInfo info = activeSessions.get(input.sessionId());
        if (info == null || !info.userEmail().equals(userEmail)) {
            log.warn("활성 세션 없음: {}", input.sessionId());
            return;
        }
        if (!hasTerminalPermission(info)) {
            closeSession(input.sessionId(), userEmail);
            return;
        }
        Map<String, Object> command = Map.of(
                "type", "terminal-input",
                "sessionId", input.sessionId(),
                "nodeId", info.nodeId(),
                "nodeName", info.nodeName(),
                "data", input.data()
        );
        messagingTemplate.convertAndSend(agentCommandDestination(info.agentId()), (Object) command);
    }

    // 에이전트의 PTY 출력을 브라우저로 전달합니다.
    public void sendOutput(TerminalOutput output) {
        SessionInfo info = activeSessions.get(output.sessionId());
        if (info == null || !info.nodeId().equals(output.nodeId())) {
            return;
        }
        if (!hasTerminalPermission(info)) {
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
        if (info == null) return;
        Map<String, Object> command = Map.of(
                "type", "terminal-close",
                "sessionId", terminalSessionId,
                "nodeId", info.nodeId(),
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
                return true;
            }
            return false;
        });
    }

    // nodeId로 nodeName(호스트명)을 조회합니다.
    private String resolveNodeName(Long nodeId) {
        Node node = nodeMapper.findById(nodeId);
        return node != null ? node.getName() : "unknown";
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
}
