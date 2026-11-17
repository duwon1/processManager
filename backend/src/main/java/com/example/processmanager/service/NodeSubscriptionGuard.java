package com.example.processmanager.service;

import com.example.processmanager.mapper.NodeMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 브라우저가 구독 중인 노드 topic의 권한을 주기적으로 다시 확인합니다.
 *
 * <p>구독 권한은 SUBSCRIBE 시점에만 검사하므로, 이후 팀에서 빠지거나 권한이 낮아져도 simple broker는
 * 계속 데이터를 보냅니다. 권한이 바뀌는 경로(팀원 삭제, 권한 변경, 노드 공유 해제 등)마다 끊는 코드를
 * 넣으면 하나라도 빠뜨렸을 때 구멍이 되므로, 경로와 무관하게 DB 기준으로 다시 확인합니다.
 * 대신 권한 회수가 반영되기까지 최대 {@link #RECHECK_MILLIS}만큼 늦어집니다.</p>
 */
@Service
public class NodeSubscriptionGuard {

    private static final Logger log = LoggerFactory.getLogger(NodeSubscriptionGuard.class);
    static final long RECHECK_MILLIS = 10_000L;

    private record Grant(Long nodeId, NodeAccessPermission permission) {}
    private record TrackedSession(Long userId, Set<Grant> grants) {}

    private final NodeMapper nodeMapper;
    private final MessageChannel clientOutboundChannel;
    // 브라우저 STOMP sessionId → 그 세션이 구독하며 통과한 (노드, 권한) 목록
    private final Map<String, TrackedSession> sessions = new ConcurrentHashMap<>();

    // @Lazy: 아웃바운드 채널 → WebSocket 설정 → 인터셉터 → 이 서비스 순환을 끊습니다.
    public NodeSubscriptionGuard(NodeMapper nodeMapper,
                                 @Lazy @Qualifier("clientOutboundChannel") MessageChannel clientOutboundChannel) {
        this.nodeMapper = nodeMapper;
        this.clientOutboundChannel = clientOutboundChannel;
    }

    // 구독 권한 검사를 통과한 세션을 기록합니다.
    public void track(String sessionId, Long userId, Long nodeId, NodeAccessPermission permission) {
        if (sessionId == null || userId == null || nodeId == null) {
            return;
        }
        sessions.computeIfAbsent(sessionId, key -> new TrackedSession(userId, ConcurrentHashMap.newKeySet()))
                .grants().add(new Grant(nodeId, permission));
    }

    public void forget(String sessionId) {
        if (sessionId != null) {
            sessions.remove(sessionId);
        }
    }

    @Scheduled(fixedDelay = RECHECK_MILLIS)
    public void disconnectRevokedSessions() {
        sessions.forEach((sessionId, tracked) -> {
            try {
                for (Grant grant : tracked.grants()) {
                    if (nodeMapper.findPermittedByUserIdAndNodeId(
                            tracked.userId(), grant.nodeId(), grant.permission().name()) == null) {
                        disconnect(sessionId, tracked.userId(), grant);
                        return;
                    }
                }
            } catch (RuntimeException e) {
                // DB 일시 오류로 정상 사용자를 끊지 않도록 이번 확인은 건너뛰고 다음 주기에 다시 봅니다.
                log.warn("구독 권한 재확인 실패: sessionId={}, error={}", sessionId, e.getMessage());
            }
        });
    }

    // simple broker에는 서버가 특정 구독만 해제하는 API가 없어 세션 전체를 끊습니다.
    // ERROR 프레임을 보내면 Spring이 전송 후 해당 WebSocket 세션을 닫고, 브라우저는 재연결하면서
    // 노드 목록을 다시 받아 남아 있는 권한만으로 구독합니다.
    private void disconnect(String sessionId, Long userId, Grant grant) {
        sessions.remove(sessionId);
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
        accessor.setSessionId(sessionId);
        accessor.setMessage("노드 접근 권한이 변경되어 연결을 종료합니다.");
        clientOutboundChannel.send(MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()));
        log.info("권한 회수로 WebSocket 세션 종료: sessionId={}, userId={}, nodeId={}, permission={}",
                sessionId, userId, grant.nodeId(), grant.permission());
    }
}
