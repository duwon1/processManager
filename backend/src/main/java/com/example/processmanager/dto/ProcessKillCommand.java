package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 프로세스 종료 명령입니다.
 * 모든 에이전트가 같은 topic을 구독하므로 nodeName으로 대상 노드를 식별합니다.
 */
public record ProcessKillCommand(
        String requestId,
        Long nodeId,
        String nodeName,
        int pid
) {
}
