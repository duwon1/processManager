package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.TerminalService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class TerminalWebSocketControllerTests {

    @Test
    void rejectsOpenPayloadWithNonNumericTerminalSizeWithoutThrowing() {
        WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
        NodeService nodeService = mock(NodeService.class);
        TerminalService terminalService = mock(TerminalService.class);
        TerminalWebSocketController controller = new TerminalWebSocketController(
                webSocketAuthInterceptor, nodeService, terminalService
        );
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", "term-1");
        payload.put("nodeId", 1);
        payload.put("cols", "wide");
        payload.put("rows", 24);

        assertDoesNotThrow(() -> controller.handleTerminalOpen(payload, headers));

        verify(terminalService, never()).openSession(
                "term-1", 1L, "node-1", "agent-1", "user@example.com", 80, 24, ""
        );
    }
}
