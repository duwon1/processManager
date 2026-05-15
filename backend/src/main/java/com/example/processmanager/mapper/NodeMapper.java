package com.example.processmanager.mapper;

import com.example.processmanager.entity.Node;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

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

    // last_seen을 갱신합니다. (5분 주기 배치에서 호출)
    void updateLastSeen(Long id);

    // 에이전트가 실시간 메시지를 보내는 동안 heartbeat를 갱신합니다.
    void updateHeartbeat(Long id);

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
