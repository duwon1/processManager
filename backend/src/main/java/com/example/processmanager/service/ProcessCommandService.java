package com.example.processmanager.service;

import com.example.processmanager.dto.AgentUninstallCommand;
import com.example.processmanager.dto.AgentUpdateCommand;
import com.example.processmanager.dto.ProcessKillCommand;
import com.example.processmanager.dto.ProcessKillResult;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class ProcessCommandService {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    );

    private final SimpMessagingTemplate messagingTemplate;

    public ProcessCommandService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // 브라우저가 보낸 requestId가 UUID 형식이면 그대로 쓰고, 아니면 서버에서 새로 발급합니다.
    // 브라우저는 이 값으로 kill 결과(process-kill-result)를 자신의 요청과 짝짓습니다.
    public static String resolveRequestId(Object rawRequestId) {
        if (rawRequestId instanceof String value && UUID_PATTERN.matcher(value.trim()).matches()) {
            return value.trim();
        }
        return UUID.randomUUID().toString();
    }

    // 에이전트별 전용 채널로 kill 명령을 전송합니다. (비동기 fire-and-forget)
    public void requestKill(Long nodeId, String agentId, String nodeName, int pid, String startedAt, String requestId) {
        messagingTemplate.convertAndSend(
                agentCommandDestination(agentId),
                new ProcessKillCommand(requestId, nodeId, agentId, nodeName, pid, startedAt)
        );
    }

    // 에이전트에게 최신 코드로 업데이트 명령을 전송합니다.
    public void requestUpdate(Long nodeId, String agentId, String nodeName, String targetSha) {
        messagingTemplate.convertAndSend(
                agentCommandDestination(agentId),
                new AgentUpdateCommand(nodeId, agentId, nodeName, targetSha)
        );
    }

    // 삭제된 노드의 에이전트에게 자가 삭제 명령을 전송합니다.
    public void requestUninstall(String agentId, String nodeName) {
        messagingTemplate.convertAndSend(
                agentCommandDestination(agentId),
                new AgentUninstallCommand(agentId, nodeName)
        );
    }

    // 에이전트의 kill 결과를 브라우저 구독 채널로 전달합니다.
    public void completeKillResult(String requestId, int pid, boolean success, String message, Long nodeId, String nodeName) {
        if (nodeId == null) {
            return;
        }
        messagingTemplate.convertAndSend(
                "/topic/node." + nodeId + ".process-kill-result",
                new ProcessKillResult(requestId, pid, success, message, nodeId, nodeName)
        );
    }

    private String agentCommandDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 명령을 전송할 수 없습니다.");
        }
        return "/topic/agent.command." + agentId;
    }
}
