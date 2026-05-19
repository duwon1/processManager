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
import java.util.List;
import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.agentCommandDestination;
import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;

@Controller
public class ServiceWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(ServiceWebSocketController.class);

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final SimpMessagingTemplate messagingTemplate;

    public ServiceWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/service")
    public void broadcastServices(
            List<Map<String, Object>> services,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
        payload.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : null);
        payload.put("services", services);
        if (nodeInfo != null && nodeInfo.nodeId() != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeInfo.nodeId(), "service"), payload, Map.of());
        }
    }

    @MessageMapping("/node.service-control")
    public void handleServiceControl(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        Object rawNodeId = payload.get("nodeId");
        if (!(rawNodeId instanceof Number) || email == null) return;

        Long nodeId = ((Number) rawNodeId).longValue();
        try {
            NodeService.NodeCommandTarget target = nodeService.validateNodeAndGetTarget(
                    nodeId, email, NodeAccessPermission.SERVICE_CONTROL
            );
            Map<String, Object> cmd = new LinkedHashMap<>(payload);
            cmd.put("type", "service-control");
            cmd.put("agentId", target.agentId());
            cmd.put("nodeName", target.nodeName());
            messagingTemplate.convertAndSend(agentCommandDestination(target.agentId()), (Object) cmd);
        } catch (Exception e) {
            log.warn("서비스 제어 요청 실패: nodeId={}, error={}", nodeId, e.getMessage());
        }
    }

    @MessageMapping("/service-control-result")
    public void handleServiceControlResult(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Map<String, Object> result = new LinkedHashMap<>(data);
        Long nodeId = nodeInfo != null ? nodeInfo.nodeId() : null;
        result.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : data.get("nodeId"));
        result.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : data.get("nodeName"));
        if (nodeId != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeId, "service-control-result"), (Object) result);
        }
    }
}
