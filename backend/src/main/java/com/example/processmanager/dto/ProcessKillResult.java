package com.example.processmanager.dto;

/**
 * 에이전트가 프로세스 종료 처리 후 서버로 회신하는 결과입니다.
 */
public record ProcessKillResult(
        String requestId,
        int pid,
        boolean success,
        String message,
        Long nodeId,
        String nodeName
) {
}
