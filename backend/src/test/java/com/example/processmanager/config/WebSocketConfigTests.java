package com.example.processmanager.config;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;

import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class WebSocketConfigTests {

    private final WebSocketConfig config = new WebSocketConfig();

    @Test
    void preservesSessionReceiveOrderForTerminalInput() {
        ReflectionTestUtils.setField(config, "allowedOrigins", "http://localhost:5173");
        StompEndpointRegistry registry = mock(StompEndpointRegistry.class, RETURNS_DEEP_STUBS);

        config.registerStompEndpoints(registry);

        verify(registry).setPreserveReceiveOrder(true);
    }

    @Test
    void preservesSessionPublishOrderForTerminalCommands() {
        MessageBrokerRegistry registry = mock(MessageBrokerRegistry.class, RETURNS_DEEP_STUBS);

        config.configureMessageBroker(registry);

        verify(registry).setPreservePublishOrder(true);
    }
}
