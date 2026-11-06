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
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketAuthInterceptorTests {

    private static final String AGENT_ID = "11111111-1111-1111-1111-111111111111";

    private final NodeService nodeService = mock(NodeService.class);
    private final TerminalService terminalService = mock(TerminalService.class);
    private final WebSocketAuthInterceptor interceptor = new WebSocketAuthInterceptor(
            mock(UserMapper.class),
            mock(NodeMapper.class),
            nodeService,
            mock(AgentRegistrationService.class),
            mock(JwtTokenProvider.class),
            terminalService,
            new ObjectMapper()
    );

    @Test
    void parsesAgentCapabilitiesWithJsonParser() {
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

        interceptor.preSend(message, mock(MessageChannel.class));

        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = interceptor.getNodeSessionInfo("agent-session");
        assertThat(nodeInfo.capabilities())
                .containsEntry("terminal", true)
                .containsEntry("serviceControl", false)
                .doesNotContainKey("label");
    }

    @Test
    void rejectsClientMessageFrameToBrokerTopic() {
        connectAgent("agent-session", 1L);

        for (StompCommand command : new StompCommand[] {StompCommand.MESSAGE, StompCommand.ACK, StompCommand.BEGIN}) {
            StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
            accessor.setSessionId("agent-session");
            accessor.setDestination("/topic/agent.command." + AGENT_ID);
            Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

            assertThatThrownBy(() -> interceptor.preSend(message, mock(MessageChannel.class)))
                    .isInstanceOf(SecurityException.class);
        }
    }

    @Test
    void stompFrameRequiresSameAuthenticationAsConnect() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.STOMP);
        accessor.setSessionId("anonymous-session");
        accessor.setSessionAttributes(new LinkedHashMap<>());
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        assertThatThrownBy(() -> interceptor.preSend(message, mock(MessageChannel.class)))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void allowsHeartbeatFrames() {
        StompHeaderAccessor accessor = StompHeaderAccessor.createForHeartbeat();
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        assertThatCode(() -> interceptor.preSend(message, mock(MessageChannel.class))).doesNotThrowAnyException();
    }

    @Test
    void rejectsSendToBrokerTopicEvenFromAgentSession() {
        connectAgent("agent-session", 1L);

        assertThatThrownBy(() -> send("agent-session", "/topic/agent.command." + AGENT_ID, null))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> send("browser-session", "/topic/node.1.process", "user@example.com"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void allowsAgentDestinationsOnlyFromAgentSession() {
        connectAgent("agent-session", 1L);

        assertThatCode(() -> send("agent-session", "/app/monitoring", null)).doesNotThrowAnyException();
        assertThatCode(() -> send("agent-session", "/app/agent.update-result", null)).doesNotThrowAnyException();
        assertThatCode(() -> send("agent-session", "/app/process/kill-result", null)).doesNotThrowAnyException();
        assertThatThrownBy(() -> send("browser-session", "/app/terminal.output", "user@example.com"))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> send("browser-session", "/app/agent.uninstall-ack", "user@example.com"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void allowsBrowserDestinationsOnlyFromLoggedInBrowserSession() {
        connectAgent("agent-session", 1L);

        assertThatCode(() -> send("browser-session", "/app/node.kill", "user@example.com")).doesNotThrowAnyException();
        assertThatThrownBy(() -> send("agent-session", "/app/node.kill", null))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> send("anonymous-session", "/app/terminal.open", null))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void rejectsUnknownAppDestination() {
        assertThatThrownBy(() -> send("browser-session", "/app/unknown", "user@example.com"))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void rejectsWildcardAndUnknownNodeTopicSubscriptions() {
        assertThatThrownBy(() -> subscribe("browser-session", "/topic/node.*.process"))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> subscribe("browser-session", "/topic/node.1.{suffix}"))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> subscribe("browser-session", "/topic/node.1.unknown"))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> subscribe("browser-session", "/topic/node.1.terminal."))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void ignoresStaleDisconnectAfterAgentReconnect() {
        connectAgent("old-session", 1L);
        connectAgent("new-session", 1L);

        disconnect("old-session");

        verify(nodeService, never()).disconnectAgent(anyLong());
        verify(terminalService, never()).cleanupNodeSessions(1L);

        disconnect("new-session");

        verify(nodeService).disconnectAgent(1L);
        verify(terminalService).cleanupNodeSessions(1L);
    }

    @Test
    void closesTerminalSessionsOpenedByDisconnectedBrowserSession() {
        disconnect("browser-session");

        verify(terminalService).closeSessionsOpenedBy("browser-session");
        verify(nodeService, never()).disconnectAgent(anyLong());
    }

    private void connectAgent(String sessionId, Long nodeId) {
        Node node = Node.builder()
                .id(nodeId)
                .userId(10L)
                .name("node-" + nodeId)
                .agentId(AGENT_ID)
                .build();
        when(nodeService.connectRegisteredAgent(AGENT_ID, "secret-1", "node-" + nodeId, "Linux"))
                .thenReturn(new NodeService.AgentConnection(node, null));
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setSessionId(sessionId);
        accessor.setNativeHeader("agent-id", AGENT_ID);
        accessor.setNativeHeader("agent-secret", "secret-1");
        accessor.setNativeHeader("hostname", "node-" + nodeId);
        accessor.setNativeHeader("os-type", "Linux");
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), mock(MessageChannel.class));
    }

    private void send(String sessionId, String destination, String userEmail) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        accessor.setSessionId(sessionId);
        accessor.setDestination(destination);
        Map<String, Object> attrs = new LinkedHashMap<>();
        if (userEmail != null) {
            attrs.put("userEmail", userEmail);
        }
        accessor.setSessionAttributes(attrs);
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), mock(MessageChannel.class));
    }

    private void subscribe(String sessionId, String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setSessionId(sessionId);
        accessor.setDestination(destination);
        accessor.setSessionAttributes(new LinkedHashMap<>(Map.of("userEmail", "user@example.com")));
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), mock(MessageChannel.class));
    }

    private void disconnect(String sessionId) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.DISCONNECT);
        accessor.setSessionId(sessionId);
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), mock(MessageChannel.class));
    }
}
