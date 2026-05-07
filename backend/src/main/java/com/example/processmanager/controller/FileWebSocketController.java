package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeAccessPermission;
import com.example.processmanager.service.NodeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.agentCommandDestination;
import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;

@Controller
public class FileWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(FileWebSocketController.class);

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final SimpMessagingTemplate messagingTemplate;

    public FileWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/file-list.request")
    public void handleFileListRequest(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        Object rawNodeId = payload.get("nodeId");
        if (!(rawNodeId instanceof Number) || email == null) {
            return;
        }

        Long nodeId = ((Number) rawNodeId).longValue();
        String path = payload.getOrDefault("path", "").toString();
        try {
            NodeService.NodeCommandTarget target = nodeService.validateNodeAndGetTarget(
                    nodeId, email, NodeAccessPermission.FILES
            );
            Map<String, Object> command = new LinkedHashMap<>();
            command.put("type", "file-list");
            command.put("nodeId", target.nodeId());
            command.put("nodeName", target.nodeName());
            command.put("path", path);
            messagingTemplate.convertAndSend(agentCommandDestination(target.agentId()), (Object) command);
        } catch (Exception e) {
            log.warn("파일 목록 요청 실패: nodeId={}, path={}, error={}", nodeId, path, e.getMessage());
        }
    }

    @MessageMapping("/file-list.result")
    public void handleFileListResult(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null) {
            log.warn("파일 목록 결과 무시: 세션 노드 정보 없음, sessionId={}", sessionId);
            return;
        }

        nodeService.touchNode(nodeInfo.nodeId());
        Map<String, Object> result = new LinkedHashMap<>(data);
        result.put("nodeId", nodeInfo.nodeId());
        result.put("nodeName", nodeInfo.nodeName());
        messagingTemplate.convertAndSend(nodeTopic(nodeInfo.nodeId(), "file-list"), (Object) result);
    }
}
