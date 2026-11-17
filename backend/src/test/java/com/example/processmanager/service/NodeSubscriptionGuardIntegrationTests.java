package com.example.processmanager.service;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import com.example.processmanager.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;

import java.lang.reflect.Type;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

// 실제 SockJS/STOMP 연결로, 구독 이후 권한이 사라지면 서버가 연결을 끊는지 확인합니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NodeSubscriptionGuardIntegrationTests {

    @LocalServerPort
    private int port;
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private NodeMapper nodeMapper;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;
    @Autowired
    private SimpMessagingTemplate messagingTemplate;
    @Autowired
    private NodeSubscriptionGuard guard;

    @Test
    void closesLiveStompSessionAfterNodeAccessIsRevoked() throws Exception {
        String email = "guard-" + UUID.randomUUID() + "@example.com";
        userMapper.insert(User.builder().email(email).name("guard").build());
        User user = userMapper.findByEmail(email);
        nodeMapper.insert(Node.builder()
                .userId(user.getId()).name("guard-node").osType("Linux").status("Y")
                .agentId(UUID.randomUUID().toString()).build());
        Node node = nodeMapper.findByUserId(user.getId()).get(0);
        String topic = "/topic/node." + node.getId() + ".monitoring";

        CountDownLatch disconnected = new CountDownLatch(1);
        BlockingQueue<String> received = new LinkedBlockingQueue<>();
        WebSocketStompClient client = new WebSocketStompClient(
                new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient()))));
        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("jwt", jwtTokenProvider.createAccessToken(email));
        StompSession session = client.connectAsync(
                "http://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connectHeaders,
                new StompSessionHandlerAdapter() {
                    @Override
                    public void handleTransportError(StompSession s, Throwable exception) {
                        disconnected.countDown();
                    }
                }).get(10, TimeUnit.SECONDS);
        session.subscribe(topic, new StompFrameHandler() {
            @Override
            public Type getPayloadType(StompHeaders headers) {
                return byte[].class;
            }

            @Override
            public void handleFrame(StompHeaders headers, Object payload) {
                received.add(new String((byte[]) payload));
            }
        });

        // 권한이 있는 동안에는 재확인을 해도 연결이 유지되고 데이터가 전달됩니다.
        String first = null;
        for (int i = 0; i < 20 && first == null; i++) {
            messagingTemplate.convertAndSend(topic, "before");
            first = received.poll(250, TimeUnit.MILLISECONDS);
        }
        assertThat(first).contains("before");
        guard.disconnectRevokedSessions();
        assertThat(disconnected.await(1, TimeUnit.SECONDS)).isFalse();
        assertThat(session.isConnected()).isTrue();

        // 노드 접근 권한이 사라진 뒤 재확인하면 서버가 연결을 끊고, 이후 데이터는 전달되지 않습니다.
        nodeMapper.deleteById(node.getId());
        received.clear();
        guard.disconnectRevokedSessions();

        assertThat(disconnected.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(session.isConnected()).isFalse();
        messagingTemplate.convertAndSend(topic, "after");
        assertThat(received.poll(1, TimeUnit.SECONDS)).isNull();
    }
}
