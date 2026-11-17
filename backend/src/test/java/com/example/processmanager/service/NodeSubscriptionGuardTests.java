package com.example.processmanager.service;

import com.example.processmanager.entity.Node;
import com.example.processmanager.mapper.NodeMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NodeSubscriptionGuardTests {

    private final NodeMapper nodeMapper = mock(NodeMapper.class);
    private final MessageChannel clientOutboundChannel = mock(MessageChannel.class);
    private final NodeSubscriptionGuard guard = new NodeSubscriptionGuard(nodeMapper, clientOutboundChannel);

    @Test
    void keepsSessionWhilePermissionIsStillValid() {
        permit(7L, 1L, NodeAccessPermission.VIEW_MONITORING);
        guard.track("session-1", 7L, 1L, NodeAccessPermission.VIEW_MONITORING);

        guard.disconnectRevokedSessions();

        verify(clientOutboundChannel, never()).send(any());
    }

    @Test
    void sendsErrorFrameToSessionWhosePermissionWasRevoked() {
        permit(7L, 1L, NodeAccessPermission.VIEW_MONITORING);
        guard.track("session-1", 7L, 1L, NodeAccessPermission.VIEW_MONITORING);
        // 모니터링 권한은 남아 있지만 프로세스 제어 권한은 회수된 상태입니다.
        guard.track("session-1", 7L, 1L, NodeAccessPermission.PROCESS_CONTROL);
        permit(8L, 1L, NodeAccessPermission.VIEW_MONITORING);
        guard.track("session-2", 8L, 1L, NodeAccessPermission.VIEW_MONITORING);

        guard.disconnectRevokedSessions();

        ArgumentCaptor<Message<?>> sent = ArgumentCaptor.forClass(Message.class);
        verify(clientOutboundChannel, times(1)).send(sent.capture());
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(sent.getValue());
        assertThat(accessor.getCommand()).isEqualTo(StompCommand.ERROR);
        assertThat(accessor.getSessionId()).isEqualTo("session-1");

        // 한 번 끊은 세션은 다음 주기에 다시 확인하지 않습니다.
        guard.disconnectRevokedSessions();
        verify(clientOutboundChannel, times(1)).send(any());
    }

    @Test
    void stopsCheckingForgottenSession() {
        guard.track("session-1", 7L, 1L, NodeAccessPermission.VIEW_MONITORING);
        guard.forget("session-1");

        guard.disconnectRevokedSessions();

        verify(nodeMapper, never()).findPermittedByUserIdAndNodeId(anyLong(), anyLong(), anyString());
        verify(clientOutboundChannel, never()).send(any());
    }

    @Test
    void keepsSessionWhenPermissionLookupFails() {
        when(nodeMapper.findPermittedByUserIdAndNodeId(7L, 1L, NodeAccessPermission.VIEW_MONITORING.name()))
                .thenThrow(new IllegalStateException("db down"))
                .thenReturn(null);
        guard.track("session-1", 7L, 1L, NodeAccessPermission.VIEW_MONITORING);

        guard.disconnectRevokedSessions();
        verify(clientOutboundChannel, never()).send(any());

        // 조회가 다시 되면 그때 회수를 반영합니다.
        guard.disconnectRevokedSessions();
        verify(clientOutboundChannel).send(any());
    }

    private void permit(Long userId, Long nodeId, NodeAccessPermission permission) {
        when(nodeMapper.findPermittedByUserIdAndNodeId(userId, nodeId, permission.name()))
                .thenReturn(Node.builder().id(nodeId).build());
    }
}
