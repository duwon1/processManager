package com.example.processmanager.service;

import com.example.processmanager.dto.TerminalInput;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TerminalServiceTests {

    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final NodeMapper nodeMapper = mock(NodeMapper.class);
    private final UserMapper userMapper = mock(UserMapper.class);
    private final TerminalService terminalService = new TerminalService(messagingTemplate, nodeMapper, userMapper);

    @Test
    void refusesToOverwriteTerminalSessionOwnedByAnotherUser() {
        terminalService.openSession("term-1", 1L, "node-1", "agent-1", "owner@example.com", "stomp-owner", 80, 24, "");

        assertThatThrownBy(() -> terminalService.openSession(
                "term-1", 1L, "node-1", "agent-1", "attacker@example.com", "stomp-attacker", 80, 24, ""))
                .isInstanceOf(SecurityException.class);

        // 기존 소유자의 세션은 그대로 유지되어 입력이 전달돼야 합니다.
        permitTerminal("owner@example.com", 7L, 1L);
        terminalService.sendInput(new TerminalInput("term-1", 1L, "ls"), "owner@example.com");
        verify(messagingTemplate).convertAndSend(eq("/topic/agent.command.agent-1"),
                argThat((Object cmd) -> cmd instanceof Map<?, ?> map && "terminal-input".equals(map.get("type"))));
    }

    @Test
    void closesTerminalSessionsWhenOpeningBrowserSessionDisconnects() {
        terminalService.openSession("term-1", 1L, "node-1", "agent-1", "owner@example.com", "stomp-owner", 80, 24, "");
        terminalService.openSession("term-2", 1L, "node-1", "agent-1", "other@example.com", "stomp-other", 80, 24, "");

        terminalService.closeSessionsOpenedBy("stomp-owner");

        verify(messagingTemplate).convertAndSend(eq("/topic/agent.command.agent-1"),
                argThat((Object cmd) -> cmd instanceof Map<?, ?> map
                        && "terminal-close".equals(map.get("type")) && "term-1".equals(map.get("sessionId"))));
        verify(messagingTemplate, never()).convertAndSend(eq("/topic/agent.command.agent-1"),
                argThat((Object cmd) -> cmd instanceof Map<?, ?> map
                        && "terminal-close".equals(map.get("type")) && "term-2".equals(map.get("sessionId"))));

        // 닫힌 세션에는 더 이상 입력이 전달되지 않습니다.
        terminalService.sendInput(new TerminalInput("term-1", 1L, "ls"), "owner@example.com");
        verify(userMapper, never()).findByEmail("owner@example.com");
    }

    @Test
    void sendOutputIgnoresUnknownSession() {
        terminalService.sendOutput(new com.example.processmanager.dto.TerminalOutput("missing", 1L, "x"));

        verify(messagingTemplate, never()).convertAndSend(any(String.class), any(Object.class));
    }

    private void permitTerminal(String email, Long userId, Long nodeId) {
        when(userMapper.findByEmail(email)).thenReturn(User.builder().id(userId).email(email).build());
        when(nodeMapper.findPermittedByUserIdAndNodeId(userId, nodeId, NodeAccessPermission.TERMINAL.name()))
                .thenReturn(Node.builder().id(nodeId).build());
    }
}
