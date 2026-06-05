package com.example.processmanager.config;

import com.example.processmanager.entity.Node;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import com.example.processmanager.security.JwtTokenProvider;
import com.example.processmanager.service.AgentRegistrationService;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.TerminalService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketAuthInterceptorTests {

    @Test
    void parsesAgentCapabilitiesWithJsonParser() {
        NodeService nodeService = mock(NodeService.class);
        WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor(
                mock(UserMapper.class),
                mock(NodeMapper.class),
                nodeService,
                mock(AgentRegistrationService.class),
                mock(JwtTokenProvider.class),
                mock(TerminalService.class),
                new ObjectMapper()
        );
        Node node = Node.builder()
                .id(1L)
                .userId(10L)
                .name("node-1")
                .agentId("agent-1")
                .build();
        when(nodeService.connectRegisteredAgent("agent-1", "secret-1", "node-1", "Linux"))
                .thenReturn(new NodeService.AgentConnection(node, null));
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionId("agent-session");
        accessor.setNativeHeader("agent-id", "agent-1");
        accessor.setNativeHeader("agent-secret", "secret-1");
        accessor.setNativeHeader("hostname", "node-1");
        accessor.setNativeHeader("os-type", "Linux");
        accessor.setNativeHeader("capabilities", "{\"terminal\":true,\"serviceControl\":false,\"label\":\"a,b:c\"}");
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        interceptor.preSend(message, mock(org.springframework.messaging.MessageChannel.class));

        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = interceptor.getNodeSessionInfo("agent-session");
        assertThat(nodeInfo.capabilities())
                .containsEntry("terminal", true)
                .containsEntry("serviceControl", false)
                .doesNotContainKey("label");
    }
}
