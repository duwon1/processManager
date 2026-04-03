package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Controller
public class ApiController {
    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final ProcessCommandService processCommandService;
    private final SimpMessagingTemplate messagingTemplate;

    public ApiController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            ProcessCommandService processCommandService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.processCommandService = processCommandService;
        this.messagingTemplate = messagingTemplate;
    }

    // 에이전트가 보낸 실시간 모니터링 데이터를 웹 클라이언트 구독 채널로 다시 전달합니다.
    @MessageMapping("/monitoring")
    @SendTo("/topic/monitoring")
    public List<Map<String, Object>> broadcastMetrics(
            List<Map<String, Object>> metrics,
            @Header("simpSessionId") String sessionId
    ) {
        // 모니터링 메시지가 도착하면 heartbeat를 갱신해 온라인 상태를 유지합니다.
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }
        System.out.println("에이전트로부터 수신한 실시간 데이터: " + metrics);
        return metrics;
    }

    // 에이전트가 보낸 프로세스 목록을 웹 클라이언트 구독 채널로 다시 전달합니다.
    @MessageMapping("/process")
    @SendTo("/topic/process")
    public Map<String, Object> broadcastProcesses(
            List<Map<String, Object>> processes,
            @Header("simpSessionId") String sessionId
    ) {
        // WebSocket 세션에 연결된 노드 정보를 함께 담아 프론트가 노드별로 분기할 수 있게 합니다.
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
        payload.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : null);
        payload.put("updatedAt", Instant.now().toString());
        payload.put("processes", processes);

        System.out.println("에이전트로부터 수신한 프로세스 데이터: " + processes.size() + "건");
        return payload;
    }

    // 브라우저가 STOMP로 보낸 프로세스 종료 요청을 처리합니다.
    // 세션에 저장된 이메일로 사용자를 인증하고, 에이전트로 kill 명령을 전송합니다.
    @MessageMapping("/node.kill")
    public void handleBrowserKillRequest(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;

        Long nodeId = ((Number) payload.get("nodeId")).longValue();
        int pid = ((Number) payload.get("pid")).intValue();

        if (email == null) {
            messagingTemplate.convertAndSend("/topic/process-kill-result",
                    new ProcessKillResult("", pid, false, "인증되지 않은 사용자입니다.", nodeId, null));
            return;
        }

        try {
            nodeService.killProcess(nodeId, pid, email);
        } catch (SecurityException | IllegalStateException e) {
            messagingTemplate.convertAndSend("/topic/process-kill-result",
                    new ProcessKillResult("", pid, false, e.getMessage(), nodeId, null));
        }
    }

    // 에이전트가 종료 처리 후 보낸 결과를 브라우저로 전달합니다.
    @MessageMapping("/process/kill-result")
    public void handleKillResult(
            ProcessKillResult payload,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Long nodeId = nodeInfo != null ? nodeInfo.nodeId() : payload.nodeId();
        String nodeName = nodeInfo != null ? nodeInfo.nodeName() : payload.nodeName();
        processCommandService.completeKillResult(
                payload.requestId(), payload.pid(), payload.success(), payload.message(), nodeId, nodeName
        );
    }
}
