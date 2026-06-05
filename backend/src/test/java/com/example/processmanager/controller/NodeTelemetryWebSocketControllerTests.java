package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.NotificationRuleService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NodeTelemetryWebSocketControllerTests {

    @Test
    void dropsProcessPayloadsThatExceedServerItemLimit() {
        WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
        NodeService nodeService = mock(NodeService.class);
        NotificationRuleService notificationRuleService = mock(NotificationRuleService.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        NodeTelemetryWebSocketController controller = new NodeTelemetryWebSocketController(
                webSocketAuthInterceptor, nodeService, notificationRuleService, messagingTemplate
        );
        when(webSocketAuthInterceptor.getNodeSessionInfo("agent-session"))
                .thenReturn(new WebSocketAuthInterceptor.NodeSessionInfo(
                        1L, "node-1", 10L, "agent-1", null, "Linux", Collections.emptyMap()
                ));
        List<Map<String, Object>> processes = IntStream.range(0, 1_001)
                .mapToObj(index -> {
                    Map<String, Object> process = new LinkedHashMap<>();
                    process.put("pid", index);
                    return process;
                })
                .toList();

        controller.broadcastProcesses(processes, "agent-session");

        verify(messagingTemplate, never()).convertAndSend(eq("/topic/node.1.process"), any(Object.class), any(Map.class));
    }
}
