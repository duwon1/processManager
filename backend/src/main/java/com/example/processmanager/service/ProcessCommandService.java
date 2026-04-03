package com.example.processmanager.service;

import com.example.processmanager.dto.ProcessKillCommand;
import com.example.processmanager.dto.ProcessKillResult;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ProcessCommandService {

    private final SimpMessagingTemplate messagingTemplate;

    public ProcessCommandService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // 에이전트 브로드캐스트 채널로 kill 명령을 전송합니다. (비동기 fire-and-forget)
    public void requestKill(Long nodeId, String nodeName, int pid) {
        String requestId = UUID.randomUUID().toString();
        messagingTemplate.convertAndSend(
                "/topic/agent.command",
                new ProcessKillCommand(requestId, nodeId, nodeName, pid)
        );
    }

    // 에이전트의 kill 결과를 브라우저 구독 채널로 전달합니다.
    public void completeKillResult(String requestId, int pid, boolean success, String message, Long nodeId, String nodeName) {
        messagingTemplate.convertAndSend(
                "/topic/process-kill-result",
                new ProcessKillResult(requestId, pid, success, message, nodeId, nodeName)
        );
    }
}
