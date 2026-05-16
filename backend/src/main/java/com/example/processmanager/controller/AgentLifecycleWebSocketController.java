package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;
import static com.example.processmanager.controller.WebSocketDestinations.userTopic;

@Controller
public class AgentLifecycleWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(AgentLifecycleWebSocketController.class);

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final SimpMessagingTemplate messagingTemplate;

    public AgentLifecycleWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/agent.register-ready")
    public void handleAgentRegisterReady(@Header("simpSessionId") String sessionId) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null || nodeInfo.pendingAgentSecret() == null || nodeInfo.pendingAgentSecret().isBlank()) {
            return;
        }

        Map<String, Object> command = new LinkedHashMap<>();
        command.put("type", "agent-secret");
        command.put("nodeName", nodeInfo.nodeName());
        command.put("agentId", nodeInfo.agentId());
        command.put("agentSecret", nodeInfo.pendingAgentSecret());
        messagingTemplate.convertAndSend("/topic/agent.secret." + nodeInfo.agentId(), (Object) command);
        log.info("노드 전용 agent_secret 전달: nodeId={}, nodeName={}", nodeInfo.nodeId(), nodeInfo.nodeName());
    }

    @MessageMapping("/agent.update-available")
    public void handleUpdateAvailable(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
            nodeService.handleUpdateAvailable(
                    nodeInfo.nodeId(),
                    nodeInfo.agentId(),
                    nodeInfo.nodeName(),
                    data.getOrDefault("currentSha", "").toString(),
                    data.getOrDefault("latestSha", "").toString()
            );
        }

        Map<String, Object> result = new LinkedHashMap<>(data);
        result.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
        result.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : data.get("nodeName"));
        result.put("agentId", nodeInfo != null ? nodeInfo.agentId() : data.get("agentId"));
        if (nodeInfo != null && nodeInfo.userId() != null) {
            messagingTemplate.convertAndSend(userTopic(nodeInfo.userId(), "agent.update-available"), (Object) result);
        }
    }

    @MessageMapping("/agent.update-result")
    public void handleUpdateResult(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null) {
            log.warn("업데이트 결과 무시: 세션 노드 정보 없음, sessionId={}", sessionId);
            return;
        }

        nodeService.touchNode(nodeInfo.nodeId());
        boolean success = Boolean.TRUE.equals(data.get("success"));
        String stage = data.getOrDefault("stage", "").toString();
        String currentSha = data.getOrDefault("currentSha", "").toString();
        String latestSha = data.getOrDefault("latestSha", "").toString();
        String message = data.getOrDefault("message", "").toString();
        nodeService.handleUpdateResult(nodeInfo.nodeId(), success, stage, currentSha, latestSha, message);

        Map<String, Object> result = new LinkedHashMap<>(data);
        result.put("nodeId", nodeInfo.nodeId());
        result.put("nodeName", nodeInfo.nodeName());
        result.put("agentId", nodeInfo.agentId());
        messagingTemplate.convertAndSend(userTopic(nodeInfo.userId(), "agent.update-result"), (Object) result);
    }

    @MessageMapping("/agent.uninstall-ack")
    public void handleUninstallAck(
            @Payload Map<String, Object> data,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null) {
            log.warn("언인스톨 ACK 무시: 세션 노드 정보 없음, sessionId={}", sessionId);
            return;
        }

        String ackNodeName = data.getOrDefault("nodeName", nodeInfo.nodeName()).toString();
        nodeService.completeUninstall(nodeInfo.userId(), nodeInfo.nodeId(), ackNodeName);

        Map<String, Object> result = new LinkedHashMap<>(data);
        result.put("nodeId", nodeInfo.nodeId());
        result.put("nodeName", ackNodeName);
        messagingTemplate.convertAndSend(nodeTopic(nodeInfo.nodeId(), "uninstall-ack"), (Object) result);
        log.info("언인스톨 ACK 처리 완료: nodeId={}, nodeName={}", nodeInfo.nodeId(), ackNodeName);
    }
}
