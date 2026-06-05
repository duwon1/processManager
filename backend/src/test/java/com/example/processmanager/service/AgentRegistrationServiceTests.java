package com.example.processmanager.service;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AgentRegistrationServiceTests {

    @Test
    void registerWithInstallTokenMarksTokenConsumedAfterSuccessfulRegistration() {
        AgentInstallTokenService installTokenService = mock(AgentInstallTokenService.class);
        NodeService nodeService = mock(NodeService.class);
        AgentRegistrationService service = new AgentRegistrationService(installTokenService, nodeService);

        User user = User.builder()
                .id(7L)
                .email("owner@example.com")
                .build();
        Node node = Node.builder()
                .id(11L)
                .userId(user.getId())
                .name("agent-host")
                .agentId("11111111-1111-1111-1111-111111111111")
                .build();

        when(installTokenService.consume("pmi_token", node.getAgentId()))
                .thenReturn(new AgentInstallTokenService.ConsumeResult(3L, user));
        when(nodeService.registerAgent(user.getId(), node.getAgentId(), node.getName(), "Windows"))
                .thenReturn(new NodeService.AgentConnection(node, "as_secret"));

        service.registerWithInstallToken("pmi_token", node.getAgentId(), node.getName(), "Windows");

        InOrder inOrder = inOrder(installTokenService, nodeService);
        inOrder.verify(installTokenService).consume("pmi_token", node.getAgentId());
        inOrder.verify(nodeService).registerAgent(user.getId(), node.getAgentId(), node.getName(), "Windows");
        inOrder.verify(installTokenService).markConsumed(3L, node.getAgentId());
    }
}
