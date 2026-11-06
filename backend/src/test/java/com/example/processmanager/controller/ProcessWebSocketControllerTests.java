package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProcessWebSocketControllerTests {

    private static final String REQUEST_ID = "22222222-2222-2222-2222-222222222222";

    private final WebSocketAuthInterceptor webSocketAuthInterceptor = mock(WebSocketAuthInterceptor.class);
    private final NodeService nodeService = mock(NodeService.class);
    private final ProcessCommandService processCommandService = mock(ProcessCommandService.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final ProcessWebSocketController controller = new ProcessWebSocketController(
            webSocketAuthInterceptor, nodeService, processCommandService, messagingTemplate
    );

    @Test
    void ignoresKillResultFromBrowserSessionWithoutAgentIdentity() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("browser-session")).thenReturn(null);

        controller.handleKillResult(
                new ProcessKillResult("req-1", 1234, true, "spoofed", 99L, "spoofed-node"),
                "browser-session"
        );

        verify(processCommandService, never()).completeKillResult(
                "req-1", 1234, true, "spoofed", 99L, "spoofed-node"
        );
    }

    @Test
    void forwardsKillResultWithAgentRequestIdAndSessionNode() {
        when(webSocketAuthInterceptor.getNodeSessionInfo("agent-session")).thenReturn(
                new WebSocketAuthInterceptor.NodeSessionInfo(1L, "node-1", 10L, "agent-1", null, "Linux", Map.of())
        );

        controller.handleKillResult(
                new ProcessKillResult(REQUEST_ID, 1234, true, "ok", 99L, "spoofed-node"),
                "agent-session"
        );

        verify(processCommandService).completeKillResult(REQUEST_ID, 1234, true, "ok", 1L, "node-1");
    }

    @Test
    void passesBrowserRequestIdAndStartedAtToKillCommand() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", 1);
        payload.put("pid", 1234);
        payload.put("startedAt", "2026-11-05T10:00:00");
        payload.put("requestId", REQUEST_ID);

        controller.handleBrowserKillRequest(payload, browserHeaders());

        verify(nodeService).killProcess(1L, 1234, "2026-11-05T10:00:00", REQUEST_ID, "user@example.com");
    }

    @Test
    void generatesRequestIdWhenBrowserRequestIdIsMissingOrInvalid() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", 1);
        payload.put("pid", 1234);
        payload.put("startedAt", null);
        payload.put("requestId", "not-a-uuid");

        controller.handleBrowserKillRequest(payload, browserHeaders());

        ArgumentCaptor<String> requestId = ArgumentCaptor.forClass(String.class);
        verify(nodeService).killProcess(eq(1L), eq(1234), isNull(), requestId.capture(), eq("user@example.com"));
        assertThat(requestId.getValue()).isNotEqualTo("not-a-uuid");
        assertThat(UUID.fromString(requestId.getValue()).toString()).isEqualTo(requestId.getValue());
    }

    @Test
    void errorResultCarriesRequestIdOfFailedKill() {
        doThrow(new IllegalStateException("offline"))
                .when(nodeService).killProcess(1L, 1234, null, REQUEST_ID, "user@example.com");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", 1);
        payload.put("pid", 1234);
        payload.put("requestId", REQUEST_ID);

        controller.handleBrowserKillRequest(payload, browserHeaders());

        ArgumentCaptor<Object> result = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/node.1.process-kill-result"), result.capture());
        ProcessKillResult killResult = (ProcessKillResult) result.getValue();
        assertThat(killResult.requestId()).isEqualTo(REQUEST_ID);
        assertThat(killResult.success()).isFalse();
        verify(processCommandService, never()).requestKill(
                eq(1L), anyString(), anyString(), eq(1234), isNull(), anyString());
    }

    private SimpMessageHeaderAccessor browserHeaders() {
        SimpMessageHeaderAccessor headers = SimpMessageHeaderAccessor.create();
        headers.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));
        return headers;
    }
}
