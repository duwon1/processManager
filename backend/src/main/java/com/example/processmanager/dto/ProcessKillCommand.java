package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 프로세스 종료 명령입니다.
 * agentId별 전용 topic으로 보내며, nodeName은 에이전트 측 검증용으로 함께 전달합니다.
 */
public record ProcessKillCommand(
        String requestId,
        Long nodeId,
        String nodeName,
        int pid
) {
}
