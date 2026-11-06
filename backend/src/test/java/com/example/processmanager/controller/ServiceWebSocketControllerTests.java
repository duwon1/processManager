package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeAccessPermission;
import com.example.processmanager.service.NodeService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ServiceWebSocketControllerTests {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
    private final NodeService nodeService = mock(NodeService.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final ServiceWebSocketController controller = new ServiceWebSocketController(
            webSocketAuthInterceptor, nodeService, messagingTemplate
    );

    @Test
    void rejectsServiceControlActionsOutsideAllowlist() {
        when(nodeService.validateNodeAndGetTarget(1L, "user@example.com", NodeAccessPermission.SERVICE_CONTROL))
                .thenReturn(new NodeService.NodeCommandTarget(1L, "node-1", "agent-1"));

        controller.handleServiceControl(
                new LinkedHashMap<>(Map.of("nodeId", 1, "name", "nginx", "action", "delete")),
                browserHeaders()
        );

        verify(messagingTemplate, never()).convertAndSend(eq("/topic/agent.command.agent-1"), any(Object.class));
    }

    @Test
    void sendsErrorResultWhenServiceControlValidationFails() {
        when(nodeService.validateNodeAndGetTarget(1L, "user@example.com", NodeAccessPermission.SERVICE_CONTROL))
                .thenReturn(new NodeService.NodeCommandTarget(1L, "node-1", "agent-1"));

        controller.handleServiceControl(
                new LinkedHashMap<>(Map.of("nodeId", 1, "name", "nginx", "action", "delete")),
                browserHeaders()
        );

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/node.1.service-control-result"), captor.capture());
        Map<?, ?> result = (Map<?, ?>) captor.getValue();
        assertThat(result.get("success")).isEqualTo(false);
        assertThat(result.get("name")).isEqualTo("nginx");
        assertThat(result.get("nodeId")).isEqualTo(1L);
    }

    @Test
    void doesNotBroadcastToNodeTopicWhenNodeIsNotPermitted() {
        when(nodeService.validateNodeAndGetTarget(1L, "user@example.com", NodeAccessPermission.SERVICE_CONTROL))
                .thenThrow(new SecurityException("denied"));

        controller.handleServiceControl(
                new LinkedHashMap<>(Map.of("nodeId", 1, "name", "nginx", "action", "delete")),
                browserHeaders()
        );

        verify(messagingTemplate, never()).convertAndSend(eq("/topic/node.1.service-control-result"), any(Object.class));
    }

    @Test
    void sendsErrorResultWhenPermittedNodeIsOffline() {
        when(nodeService.validateNodeAndGetTarget(1L, "user@example.com", NodeAccessPermission.SERVICE_CONTROL))
                .thenThrow(new IllegalStateException("노드가 현재 연결되어 있지 않습니다."));

        controller.handleServiceControl(
                new LinkedHashMap<>(Map.of("nodeId", 1, "name", "nginx", "action", "restart")),
                browserHeaders()
        );

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/node.1.service-control-result"), captor.capture());
        Map<?, ?> result = (Map<?, ?>) captor.getValue();
        assertThat(result.get("success")).isEqualTo(false);
    }

    @Test
    void stripsAgentIdentityFromServiceControlResultBroadcast() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("agent-session")).thenReturn(
                new WebSocketAuthInterceptor.NodeSessionInfo(1L, "node-1", 10L, "agent-1", null, "Linux", Map.of())
        );
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", "nginx");
        data.put("success", true);
        data.put("agentId", "agent-1");
        data.put("agentSecret", "as_secret");

        controller.handleServiceControlResult(data, "agent-session");

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/node.1.service-control-result"), captor.capture());
        Map<?, ?> result = (Map<?, ?>) captor.getValue();
        assertThat(result.containsKey("agentId")).isFalse();
        assertThat(result.containsKey("agentSecret")).isFalse();
        assertThat(result.get("name")).isEqualTo("nginx");
        assertThat(result.get("nodeId")).isEqualTo(1L);
    }

    private SimpMessageHeaderAccessor browserHeaders() {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));
        return headers;
    }
}
