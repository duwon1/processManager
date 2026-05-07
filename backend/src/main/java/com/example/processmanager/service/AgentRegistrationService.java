package com.example.processmanager.service;

import com.example.processmanager.entity.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentRegistrationService {

    private final AgentInstallTokenService installTokenService;
    private final NodeService nodeService;

    public AgentRegistrationService(AgentInstallTokenService installTokenService, NodeService nodeService) {
        this.installTokenService = installTokenService;
        this.nodeService = nodeService;
    }

    @Transactional
    public RegistrationResult registerWithInstallToken(String installToken, String agentId, String hostname, String osType) {
        User user = installTokenService.consume(installToken, agentId);
        NodeService.AgentConnection connection = nodeService.registerAgent(user.getId(), agentId, hostname, osType);
        return new RegistrationResult(connection, user.getId(), user.getEmail());
    }

    public record RegistrationResult(
            NodeService.AgentConnection connection,
            Long userId,
            String userEmail
    ) {
    }
}
