package com.example.processmanager.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.example.processmanager.entity.DeletedNodeReservation;

@Mapper
public interface DeletedNodesMapper {

    // 삭제된 노드를 기록합니다.
    void insert(@Param("userId") Long userId,
                @Param("hostname") String hostname,
                @Param("agentId") String agentId,
                @Param("agentSecretHash") String agentSecretHash);

    void updateReservationAuth(@Param("userId") Long userId,
                               @Param("hostname") String hostname,
                               @Param("agentId") String agentId,
                               @Param("agentSecretHash") String agentSecretHash);

    // 재접속 시 삭제 대기 여부를 확인합니다.
    boolean existsByUserIdAndHostname(@Param("userId") Long userId, @Param("hostname") String hostname);

    DeletedNodeReservation findByAgentId(@Param("agentId") String agentId);

    // 언인스톨 명령 전송 후 기록을 제거합니다.
    void deleteByUserIdAndHostname(@Param("userId") Long userId, @Param("hostname") String hostname);

    // 실제 삭제 대기 노드가 없는 오래된 예약 기록을 정리합니다.
    int deleteStaleWithoutDeletePendingNode();
}
