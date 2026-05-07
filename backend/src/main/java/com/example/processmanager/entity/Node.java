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
    private String agentSecretHash; // 등록 후 재접속 인증에 사용하는 노드 전용 secret의 SHA-256 해시
    private LocalDateTime agentSecretIssuedAt; // 노드 secret 발급/회전 시각
    private String updateStatus; // 에이전트 코드 업데이트 상태 (NONE/PENDING/UPDATING/FAILED)
    private String updateCurrentSha; // 에이전트가 보고한 현재 Git 커밋
    private String updateLatestSha; // GitHub 원격 저장소의 최신 커밋
    private String updateMessage; // 업데이트 실패/진행 상태 메시지
    private LocalDateTime updateCheckedAt; // 업데이트 상태가 마지막으로 갱신된 시각
    private Boolean canViewMonitoring; // 현재 사용자 기준 모니터링 조회 권한
    private Boolean canViewFiles; // 현재 사용자 기준 파일 목록 조회 권한
    private Boolean canUseTerminal; // 현재 사용자 기준 터미널 사용 권한
    private Boolean canControlProcesses; // 현재 사용자 기준 프로세스 제어 권한
    private Boolean canControlServices; // 현재 사용자 기준 서비스 제어 권한
}
