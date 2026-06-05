package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 업데이트 실행 명령입니다.
 * agentId가 명령 대상이며 nodeName은 구버전 에이전트 호환용입니다.
 */
public record AgentUpdateCommand(
        String type,
        Long nodeId,
        String agentId,
        String nodeName,
        String targetSha
) {
    public AgentUpdateCommand(Long nodeId, String agentId, String nodeName, String targetSha) {
        this("update", nodeId, agentId, nodeName, targetSha);
    }
}
