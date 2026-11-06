package com.example.processmanager.service;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.DeletedNodesMapper;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NodeServiceTests {

    private static final String OLD_AGENT_ID = "11111111-1111-1111-1111-111111111111";
    private static final String NEW_AGENT_ID = "22222222-2222-2222-2222-222222222222";

    private final NodeMapper nodeMapper = mock(NodeMapper.class);
    private final CurrentUserProvider currentUserProvider = mock(CurrentUserProvider.class);
    private final ProcessCommandService processCommandService = mock(ProcessCommandService.class);
    private final DeletedNodesMapper deletedNodesMapper = mock(DeletedNodesMapper.class);
    private final TaskScheduler taskScheduler = mock(TaskScheduler.class);
    private final NodeService nodeService = new NodeService(
            nodeMapper,
            mock(UserMapper.class),
            currentUserProvider,
            processCommandService,
            deletedNodesMapper,
            mock(NotificationService.class),
            taskScheduler,
            mock(SimpMessagingTemplate.class)
    );

    @Test
    void registerAgentRejectsNonUuidAgentId() {
        assertThatThrownBy(() -> nodeService.registerAgent(7L, "../agent.command.x", "host-1", "Linux"))
                .isInstanceOf(SecurityException.class);
        verify(nodeMapper, never()).findByAgentId(anyString());
    }

    @Test
    void connectRegisteredAgentRejectsNonUuidAgentId() {
        assertThatThrownBy(() -> nodeService.connectRegisteredAgent("agent.*", "as_secret", "host-1", "Linux"))
                .isInstanceOf(SecurityException.class);
        verify(nodeMapper, never()).findByAgentId(anyString());
    }

    @Test
    void hostnameFallbackUpdatesAgentIdWhenExistingNodeIsOffline() {
        Node existing = node(5L, OLD_AGENT_ID, NodeStatus.OFFLINE, LocalDateTime.now().minusMinutes(10));
        when(nodeMapper.findByAgentId(NEW_AGENT_ID)).thenReturn(null);
        when(nodeMapper.findByUserIdAndName(7L, "host-1")).thenReturn(existing);
        when(nodeMapper.findById(5L)).thenReturn(existing);

        nodeService.registerAgent(7L, NEW_AGENT_ID, "host-1", "Linux");

        verify(nodeMapper).updateAgentId(5L, NEW_AGENT_ID);
        verify(nodeMapper).updateStatus(5L, NodeStatus.ONLINE);
    }

    @Test
    void hostnameFallbackRejectsRegistrationWhileExistingAgentIsOnline() {
        Node existing = node(5L, OLD_AGENT_ID, NodeStatus.ONLINE, LocalDateTime.now());
        when(nodeMapper.findByAgentId(NEW_AGENT_ID)).thenReturn(null);
        when(nodeMapper.findByUserIdAndName(7L, "host-1")).thenReturn(existing);

        assertThatThrownBy(() -> nodeService.registerAgent(7L, NEW_AGENT_ID, "host-1", "Linux"))
                .isInstanceOf(SecurityException.class);

        verify(nodeMapper, never()).updateAgentId(anyLong(), anyString());
        verify(nodeMapper, never()).updateAgentSecretHash(anyLong(), anyString());
    }

    @Test
    void touchNodeThrottlesHeartbeatWritesPerNode() {
        nodeService.touchNode(1L);
        nodeService.touchNode(1L);
        nodeService.touchNode(1L);
        nodeService.touchNode(2L);

        verify(nodeMapper, times(1)).updateHeartbeat(eq(1L), any(LocalDateTime.class));
        verify(nodeMapper, times(1)).updateHeartbeat(eq(2L), any(LocalDateTime.class));
    }

    @Test
    void disconnectResetsHeartbeatThrottle() {
        nodeService.touchNode(1L);
        nodeService.disconnectAgent(1L);
        nodeService.touchNode(1L);

        verify(nodeMapper, times(2)).updateHeartbeat(eq(1L), any(LocalDateTime.class));
    }

    @Test
    void deleteNodeSendsUninstallOnlyAfterCommit() {
        User user = User.builder().id(7L).email("owner@example.com").build();
        Node online = node(5L, OLD_AGENT_ID, NodeStatus.ONLINE, LocalDateTime.now());
        when(currentUserProvider.findCurrentUser()).thenReturn(user);
        when(nodeMapper.findOwnedByUserIdAndNodeId(7L, 5L)).thenReturn(online);

        TransactionSynchronizationManager.initSynchronization();
        try {
            nodeService.deleteNode(5L);

            verify(nodeMapper).markDeletePending(5L);
            verify(processCommandService, never()).requestUninstall(anyString(), anyString());

            for (TransactionSynchronization synchronization : TransactionSynchronizationManager.getSynchronizations()) {
                synchronization.afterCommit();
            }
            verify(processCommandService).requestUninstall(OLD_AGENT_ID, "host-1");
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private Node node(Long id, String agentId, String status, LocalDateTime lastSeen) {
        return Node.builder()
                .id(id)
                .userId(7L)
                .name("host-1")
                .agentId(agentId)
                .status(status)
                .lastSeen(lastSeen)
                .build();
    }
}
