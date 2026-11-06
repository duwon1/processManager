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

import static com.example.processmanager.controller.WebSocketDestinations.agentServiceRequestDestination;
import static com.example.processmanager.controller.WebSocketDestinations.agentCommandDestination;
import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;
import static com.example.processmanager.controller.WebSocketDestinations.safeClientMessage;
import static com.example.processmanager.controller.WebSocketDestinations.withoutAgentCredentials;

@Controller
public class ServiceWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(ServiceWebSocketController.class);
    private static final List<String> SERVICE_CONTROL_ACTIONS = List.of("start", "stop", "restart");

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

    @MessageMapping("/service.request")
    public void handleServiceListRequest(
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
            messagingTemplate.convertAndSend(agentServiceRequestDestination(target.agentId()), (Object) req);
        } catch (Exception e) {
            log.warn("서비스 목록 요청 실패: nodeId={}, error={}", nodeId, e.getMessage());
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
        String serviceName = payload.get("name") instanceof String value ? value.trim() : "";
        String action = payload.get("action") instanceof String value ? value.trim() : "";
        if (nodeId <= 0) {
            return;
        }

        try {
            // 권한을 먼저 확인합니다. 권한이 없는 사용자가 남의 노드 결과 topic에 실패 결과를 흘려보내지 못하게 합니다.
            NodeService.NodeCommandTarget target = nodeService.validateNodeAndGetTarget(
                    nodeId, email, NodeAccessPermission.SERVICE_CONTROL
            );
            if (serviceName.isBlank() || !SERVICE_CONTROL_ACTIONS.contains(action)) {
                log.warn("서비스 제어 요청 거부: nodeId={}, action={}", nodeId, action);
                // kill 경로처럼 결과 topic으로 실패를 알려 브라우저의 진행 표시가 멈추지 않게 합니다.
                sendServiceControlError(nodeId, serviceName, action, "요청을 처리할 수 없습니다.");
                return;
            }
            Map<String, Object> cmd = new LinkedHashMap<>();
            cmd.put("nodeId", target.nodeId());
            cmd.put("name", serviceName);
            cmd.put("action", action);
            cmd.put("type", "service-control");
            cmd.put("agentId", target.agentId());
            cmd.put("nodeName", target.nodeName());
            messagingTemplate.convertAndSend(agentCommandDestination(target.agentId()), (Object) cmd);
        } catch (SecurityException e) {
            // 권한 없는 요청은 노드 topic에 아무것도 보내지 않습니다.
            log.warn("서비스 제어 권한 없음: nodeId={}, error={}", nodeId, e.getMessage());
        } catch (Exception e) {
            log.warn("서비스 제어 요청 실패: nodeId={}, error={}", nodeId, e.getMessage());
            sendServiceControlError(nodeId, serviceName, action, safeClientMessage(e));
        }
    }

    private void sendServiceControlError(Long nodeId, String serviceName, String action, String message) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodeId", nodeId);
        result.put("nodeName", null);
        result.put("name", serviceName);
        result.put("action", action);
        result.put("success", false);
        result.put("message", message);
        messagingTemplate.convertAndSend(nodeTopic(nodeId, "service-control-result"), (Object) result);
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

        Map<String, Object> result = withoutAgentCredentials(data);
        Long nodeId = nodeInfo != null ? nodeInfo.nodeId() : null;
        result.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : data.get("nodeId"));
        result.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : data.get("nodeName"));
        if (nodeId != null) {
            messagingTemplate.convertAndSend(nodeTopic(nodeId, "service-control-result"), (Object) result);
        }
    }
}
