package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeAccessPermission;
import com.example.processmanager.service.NodeService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ServiceWebSocketControllerTests {

    @Test
    void rejectsServiceControlActionsOutsideAllowlist() {
        WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
        NodeService nodeService = mock(NodeService.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        ServiceWebSocketController controller = new ServiceWebSocketController(
                webSocketAuthInterceptor, nodeService, messagingTemplate
        );
        when(nodeService.validateNodeAndGetTarget(1L, "user@example.com", NodeAccessPermission.SERVICE_CONTROL))
                .thenReturn(new NodeService.NodeCommandTarget(1L, "node-1", "agent-1"));

        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));

        controller.handleServiceControl(
                new LinkedHashMap<>(Map.of("nodeId", 1, "name", "nginx", "action", "delete")),
                headers
        );

        verify(messagingTemplate, never()).convertAndSend(eq("/topic/agent.command.agent-1"), any(Object.class));
    }
}
