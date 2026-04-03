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

    // ID로 단건 조회합니다.
    Node findById(Long id);

    // user_id + hostname으로 기존 노드를 찾습니다. (재연결 시 동일 노드 식별)
    Node findByUserIdAndName(@Param("userId") Long userId, @Param("name") String name);

    // 에이전트 연결/해제 시 상태와 IP를 갱신합니다.
    void updateStatus(@Param("id") Long id, @Param("status") String status, @Param("host") String host);

    // last_seen을 갱신합니다. (5분 주기 배치에서 호출)
    void updateLastSeen(Long id);

    // 에이전트가 실시간 메시지를 보내는 동안 heartbeat를 갱신합니다.
    void updateHeartbeat(Long id);
}
