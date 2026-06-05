package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;
import static com.example.processmanager.controller.WebSocketDestinations.safeClientMessage;

@Controller
public class ProcessWebSocketController {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final ProcessCommandService processCommandService;
    private final SimpMessagingTemplate messagingTemplate;

    public ProcessWebSocketController(
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

    @MessageMapping("/node.kill")
    public void handleBrowserKillRequest(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        Object rawNodeId = payload.get("nodeId");
        Object rawPid = payload.get("pid");
        if (!(rawNodeId instanceof Number) || !(rawPid instanceof Number) || email == null) {
            return;
        }

        Long nodeId = ((Number) rawNodeId).longValue();
        int pid = ((Number) rawPid).intValue();
        if (nodeId <= 0 || pid <= 0) {
            return;
        }

        try {
            nodeService.killProcess(nodeId, pid, email);
        } catch (SecurityException | IllegalStateException e) {
            messagingTemplate.convertAndSend(nodeTopic(nodeId, "process-kill-result"),
                    new ProcessKillResult("", pid, false, safeClientMessage(e), nodeId, null));
        }
    }

    @MessageMapping("/process/kill-result")
    public void handleKillResult(
            ProcessKillResult payload,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null || nodeInfo.nodeId() == null) {
            return;
        }
        nodeService.touchNode(nodeInfo.nodeId());

        processCommandService.completeKillResult(
                payload.requestId(), payload.pid(), payload.success(), payload.message(), nodeInfo.nodeId(), nodeInfo.nodeName()
        );
    }
}
