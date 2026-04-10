package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class Node {
    private Long id;
    private Long userId;     // 소유자 (users.id 참조)
    private String name;     // 에이전트 hostname (표시용)
    private String osType;   // 운영체제 (Linux / Windows)
    private String status;   // 연결 상태 (Y: 연결됨, N: 끊김)
    private LocalDateTime lastSeen;  // 마지막 통신 시간
    private LocalDateTime createdAt;
    private String agentId;  // 에이전트 고유 UUID (재설치 시 동일 노드 식별)
}
