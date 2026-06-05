package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProcessWebSocketControllerTests {

    @Test
    void ignoresKillResultFromBrowserSessionWithoutAgentIdentity() {
        WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
        NodeService nodeService = mock(NodeService.class);
        ProcessCommandService processCommandService = mock(ProcessCommandService.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        ProcessWebSocketController controller = new ProcessWebSocketController(
                webSocketAuthInterceptor, nodeService, processCommandService, messagingTemplate
        );
        when(webSocketAuthInterceptor.getNodeSessionInfo("browser-session")).thenReturn(null);

        controller.handleKillResult(
                new ProcessKillResult("req-1", 1234, true, "spoofed", 99L, "spoofed-node"),
                "browser-session"
        );

        verify(processCommandService, never()).completeKillResult(
                "req-1", 1234, true, "spoofed", 99L, "spoofed-node"
        );
    }
}
