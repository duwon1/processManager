package com.example.processmanager.service;

import com.example.processmanager.mapper.AgentInstallTokenMapper;
import com.example.processmanager.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class AgentInstallTokenServiceTests {

    @Test
    void consumeRejectsNonUuidAgentIdBeforeTouchingToken() {
        AgentInstallTokenMapper installTokenMapper = mock(AgentInstallTokenMapper.class);
        AgentInstallTokenService service = new AgentInstallTokenService(installTokenMapper, mock(UserMapper.class));

        assertThatThrownBy(() -> service.consume("pmi_" + "a".repeat(64), "agent.*"))
                .isInstanceOf(SecurityException.class);

        Mockito.verifyNoInteractions(installTokenMapper);
    }

    @Test
    void isValidAgentIdAcceptsOnlyUuid() {
        assertThat(AgentInstallTokenService.isValidAgentId("11111111-1111-1111-1111-111111111111")).isTrue();
        assertThat(AgentInstallTokenService.isValidAgentId("agent-1")).isFalse();
        assertThat(AgentInstallTokenService.isValidAgentId("11111111-1111-1111-1111-111111111111.x")).isFalse();
        assertThat(AgentInstallTokenService.isValidAgentId(null)).isFalse();
    }
}
