package com.example.processmanager.mapper;

import com.example.processmanager.entity.Node;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface NodeMapper {

    // 에이전트 첫 연결 시 노드를 자동 등록합니다.
    void insert(Node node);

    // 특정 사용자의 노드 목록을 조회합니다.
    List<Node> findByUserId(Long userId);

    List<Node> findAccessibleByUserId(Long userId);

    // ID로 단건 조회합니다.
    Node findById(Long id);

    Node findAccessibleByUserIdAndNodeId(@Param("userId") Long userId, @Param("nodeId") Long nodeId);

    Node findPermittedByUserIdAndNodeId(@Param("userId") Long userId,
                                        @Param("nodeId") Long nodeId,
                                        @Param("permission") String permission);

    Node findOwnedByUserIdAndNodeId(@Param("userId") Long userId, @Param("nodeId") Long nodeId);

    // user_id + hostname으로 기존 노드를 찾습니다. (fallback 식별)
    Node findByUserIdAndName(@Param("userId") Long userId, @Param("name") String name);

    // agent_id로 기존 노드를 찾습니다. (재설치 후에도 동일 노드 식별)
    Node findByAgentId(@Param("agentId") String agentId);

    // 노드 전용 secret 해시를 저장합니다. (등록 이후 재접속 인증에 사용)
    void updateAgentSecretHash(@Param("id") Long id, @Param("agentSecretHash") String agentSecretHash);

    // 노드 이름과 osType을 갱신합니다. (이름 변경 시 사용)
    void updateName(@Param("id") Long id, @Param("name") String name);

    // 에이전트 연결/해제 시 상태를 갱신합니다.
    void updateStatus(@Param("id") Long id, @Param("status") String status);

    // last_seen만 DB 시각으로 갱신합니다. (현재 호출처 없음, heartbeat는 updateHeartbeat 사용)
    void updateLastSeen(Long id);

    // 에이전트 연결 시와 메시지 수신 시(NodeService에서 노드별 5초 간격으로 제한) status='Y'와 last_seen을 갱신합니다.
    // lastSeen은 JVM 시각을 넘겨 DB/JVM 타임존 차이와 무관하게 온라인 판정이 되게 합니다.
    void updateHeartbeat(@Param("id") Long id, @Param("lastSeen") LocalDateTime lastSeen);

    // hostname fallback으로 찾은 기존 노드의 agent_id를 재설치된 에이전트 값으로 교체합니다.
    void updateAgentId(@Param("id") Long id, @Param("agentId") String agentId);

    // 노드를 삭제 대기 상태로 표시합니다.
    void markDeletePending(Long id);

    // 에이전트가 업데이트 가능 상태를 보고하면 DB에 대기 상태로 저장합니다.
    void markUpdateAvailable(@Param("id") Long id,
                             @Param("currentSha") String currentSha,
                             @Param("latestSha") String latestSha);

    // 사용자가 업데이트를 요청하면 ACK 대기 상태로 전환합니다.
    void markUpdateInProgress(Long id);

    // 에이전트가 최신 커밋으로 재연결되면 업데이트 상태를 완료 처리합니다.
    void clearUpdateStatus(Long id);

    // 업데이트 실패 또는 미완료 상태를 기록합니다.
    void markUpdateFailed(@Param("id") Long id, @Param("message") String message);

    // ACK 수신 후 노드를 실제로 삭제합니다.
    void deleteById(Long id);
}
