package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.TerminalOutput;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.TerminalService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TerminalWebSocketControllerTests {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
    private final NodeService nodeService = mock(NodeService.class);
    private final TerminalService terminalService = mock(TerminalService.class);
    private final TerminalWebSocketController controller = new TerminalWebSocketController(
            webSocketAuthInterceptor, nodeService, terminalService
    );

    @Test
    void rejectsOpenPayloadWithNonNumericTerminalSizeWithoutThrowing() {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", "term-1");
        payload.put("nodeId", 1);
        payload.put("cols", "wide");
        payload.put("rows", 24);

        assertDoesNotThrow(() -> controller.handleTerminalOpen(payload, headers));

        verify(terminalService, never()).openSession(
                "term-1", 1L, "node-1", "agent-1", "user@example.com", null, 80, 24, ""
        );
    }

    @Test
    void dropsTerminalOutputFromNonAgentSession() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("browser-session")).thenReturn(null);

        controller.handleTerminalOutput(new TerminalOutput("term-1", 1L, "spoofed"), "browser-session");

        verify(terminalService, never()).sendOutput(any());
        verify(nodeService, never()).touchNode(any());
    }

    @Test
    void dropsTerminalOutputClaimingAnotherNode() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("agent-session")).thenReturn(nodeInfo(1L));

        controller.handleTerminalOutput(new TerminalOutput("term-1", 2L, "spoofed"), "agent-session");

        verify(terminalService, never()).sendOutput(any());
    }

    @Test
    void forwardsTerminalOutputWithSessionNodeId() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("agent-session")).thenReturn(nodeInfo(1L));

        controller.handleTerminalOutput(new TerminalOutput("term-1", null, "hello"), "agent-session");

        verify(terminalService).sendOutput(new TerminalOutput("term-1", 1L, "hello"));
    }

    private WebSocketAuthInterceptor.NodeSessionInfo nodeInfo(Long nodeId) {
        return new WebSocketAuthInterceptor.NodeSessionInfo(
                nodeId, "node-" + nodeId, 10L, "agent-1", null, "Linux", Map.of()
        );
    }
}
