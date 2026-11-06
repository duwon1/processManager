package com.example.processmanager.service;

import com.example.processmanager.dto.ProcessKillCommand;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ProcessCommandServiceTests {

    private static final String REQUEST_ID = "33333333-3333-3333-3333-333333333333";

    @Test
    void killCommandCarriesRequestIdAndStartedAtWithStablePropertyNames() {
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        ProcessCommandService service = new ProcessCommandService(messagingTemplate);

        service.requestKill(1L, "agent-1", "node-1", 1234, "2026-11-05T10:00:00", REQUEST_ID);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/agent.command.agent-1"), captor.capture());
        ProcessKillCommand command = (ProcessKillCommand) captor.getValue();
        assertThat(command.requestId()).isEqualTo(REQUEST_ID);
        assertThat(command.startedAt()).isEqualTo("2026-11-05T10:00:00");

        String json = new ObjectMapper().writeValueAsString(command);
        assertThat(json)
                .contains("\"requestId\":\"" + REQUEST_ID + "\"")
                .contains("\"nodeId\":1")
                .contains("\"agentId\":\"agent-1\"")
                .contains("\"nodeName\":\"node-1\"")
                .contains("\"pid\":1234")
                .contains("\"startedAt\":\"2026-11-05T10:00:00\"");
    }

    @Test
    void resolveRequestIdKeepsValidUuidAndReplacesInvalidValues() {
        assertThat(ProcessCommandService.resolveRequestId(REQUEST_ID)).isEqualTo(REQUEST_ID);
        assertThat(ProcessCommandService.resolveRequestId("abc")).isNotEqualTo("abc").hasSize(36);
        assertThat(ProcessCommandService.resolveRequestId(null)).hasSize(36);
        assertThat(ProcessCommandService.resolveRequestId(12345)).hasSize(36);
    }
}
