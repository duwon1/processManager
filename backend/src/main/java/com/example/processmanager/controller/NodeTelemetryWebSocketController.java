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

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.agentSysinfoDestination;
import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;

@Controller
public class NodeTelemetryWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(NodeTelemetryWebSocketController.class);

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final SimpMessagingTemplate messagingTemplate;

    public NodeTelemetryWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/monitoring")
    public void broadcastMetrics(
            List<Map<String, Object>> metrics,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        List<Map<String, Object>> payload = new ArrayList<>(metrics.size());
        String updatedAt = Instant.now().toString();
        for (Map<String, Object> metric : metrics) {
            Map<String, Object> enrichedMetric = new LinkedHashMap<>(metric);
            enrichedMetric.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
            enrichedMetric.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : null);
            enrichedMetric.put("updatedAt", updatedAt);
            payload.add(enrichedMetric);
        }

        log.debug("에이전트로부터 수신한 실시간 데이터: {}", metrics);
        if (nodeInfo != null && nodeInfo.nodeId() != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeInfo.nodeId(), "monitoring"), payload, Map.of());
        }
    }

    @MessageMapping("/process")
    public void broadcastProcesses(
            List<Map<String, Object>> processes,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
        payload.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : null);
        payload.put("updatedAt", Instant.now().toString());
        payload.put("processes", processes);

        log.debug("에이전트로부터 수신한 프로세스 데이터: {}건", processes.size());
        if (nodeInfo != null && nodeInfo.nodeId() != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeInfo.nodeId(), "process"), payload, Map.of());
        }
    }

    @MessageMapping("/system-info.request")
    public void handleSystemInfoRequest(
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
                    nodeId, email, NodeAccessPermission.VIEW_MONITORING
            );
            Map<String, Object> req = new LinkedHashMap<>();
            req.put("nodeId", target.nodeId());
            req.put("agentId", target.agentId());
            req.put("nodeName", target.nodeName());
            messagingTemplate.convertAndSend(agentSysinfoDestination(target.agentId()), req, Map.of());
        } catch (Exception e) {
            log.warn("시스템 정보 요청 실패: nodeId={}, error={}", nodeId, e.getMessage());
        }
    }

    @MessageMapping("/system-info")
    public void handleSystemInfo(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Map<String, Object> result = new LinkedHashMap<>(data);
        result.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : data.get("nodeId"));
        result.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : data.get("nodeName"));
        result.put("osType", nodeInfo != null ? nodeInfo.osType() : data.get("osType"));
        if (nodeInfo != null && nodeInfo.capabilities() != null && !nodeInfo.capabilities().isEmpty()) {
            result.put("capabilities", nodeInfo.capabilities());
        }

        Long nodeId = nodeInfo != null ? nodeInfo.nodeId() : null;
        if (nodeId != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeId, "system-info"), result, Map.of());
        }
    }
}
