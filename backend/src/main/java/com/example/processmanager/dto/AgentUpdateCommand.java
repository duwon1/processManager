package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 업데이트 실행 명령입니다.
 */
public record AgentUpdateCommand(
        String type,
        Long nodeId,
        String agentId,
        String nodeName
) {
    public AgentUpdateCommand(Long nodeId, String agentId, String nodeName) {
        this("update", nodeId, agentId, nodeName);
    }
}
