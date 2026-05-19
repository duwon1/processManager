package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 프로세스 종료 명령입니다.
 * agentId별 전용 topic으로 보내며, agentId를 명령 대상 검증값으로 함께 전달합니다.
 */
public record ProcessKillCommand(
        String requestId,
        Long nodeId,
        String agentId,
        String nodeName,
        int pid
) {
}
