package com.example.processmanager.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * WebSocket 및 STOMP 메시지 브로커 설정입니다.
 * 브라우저(SockJS)와 Python 에이전트(native WebSocket) 두 가지 연결 방식을 모두 지원합니다.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    // @Lazy: ProcessCommandService → SimpMessagingTemplate → WebSocketConfig → WebSocketAuthInterceptor 순환을 끊습니다.
    @Autowired
    @Lazy
    private WebSocketAuthInterceptor webSocketAuthInterceptor;

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    /**
     * 메시지 브로커 경로를 설정합니다.
     * /topic  : 서버 → 클라이언트 브로드캐스트 채널
     * /app    : 클라이언트 → 서버 메시지 수신 접두사
     */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableSimpleBroker("/topic");
        config.setApplicationDestinationPrefixes("/app");
    }

    /**
     * STOMP 인바운드 채널에 인증 인터셉터를 등록합니다.
     * 에이전트 연결 시 account-token 헤더를 검증하고 노드 정보를 매핑합니다.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor);
    }

    /**
     * WebSocket 엔드포인트를 등록합니다.
     * /ws         : 브라우저(React) 전용 SockJS 엔드포인트
     * /ws-native  : Python 에이전트 전용 순수 WebSocket 엔드포인트
     */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOriginPatterns())
                .withSockJS();

        registry.addEndpoint("/ws-native")
                .setAllowedOriginPatterns(allowedOriginPatterns())
                // 에이전트 연결 핸드셰이크 시 클라이언트 IP를 세션 속성에 저장합니다.
                .addInterceptors(new HandshakeInterceptor() {
                    @Override
                    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                            WebSocketHandler wsHandler, Map<String, Object> attributes) {
                        if (request instanceof ServletServerHttpRequest servletRequest) {
                            HttpServletRequest httpReq = servletRequest.getServletRequest();
                            // 프록시 환경에서는 X-Forwarded-For 헤더가 실제 IP를 담습니다.
                            String ip = httpReq.getHeader("X-Forwarded-For");
                            if (ip == null || ip.isBlank()) {
                                ip = httpReq.getRemoteAddr();
                            }
                            attributes.put("remoteAddress", ip);
                        }
                        return true;
                    }
                    @Override
                    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                            WebSocketHandler wsHandler, Exception exception) {}
                });
    }

    /**
     * STOMP 전송 계층의 메시지 크기 제한을 설정합니다.
     * 프로세스 목록처럼 크기가 큰 STOMP 프레임도 정상 처리할 수 있도록 한도를 늘립니다.
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setMessageSizeLimit(512 * 1024);   // STOMP 단일 메시지 최대 크기: 512KB
        registry.setSendBufferSizeLimit(1024 * 1024); // 송신 버퍼 최대 크기: 1MB
        registry.setSendTimeLimit(20_000);             // 송신 타임아웃: 20초
    }

    /**
     * Tomcat WebSocket 컨테이너의 텍스트·바이너리 메시지 버퍼를 설정합니다.
     * 기본값(8KB)이 너무 작아 프로세스 목록 전송 시 1009(message too big) 오류가 발생하므로
     * 512KB로 늘려 에이전트의 대용량 프레임을 수용합니다.
     */
    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(512 * 1024);   // 텍스트 메시지 버퍼: 512KB
        container.setMaxBinaryMessageBufferSize(512 * 1024); // 바이너리 메시지 버퍼: 512KB
        return container;
    }

    private String[] allowedOriginPatterns() {
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .toList();
        return origins.toArray(String[]::new);
    }
}
