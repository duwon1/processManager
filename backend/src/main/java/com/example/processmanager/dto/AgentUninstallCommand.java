package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 자동 삭제 명령입니다.
 * agentId별 전용 topic으로 전송하며, agentId가 명령 대상입니다.
 */
public record AgentUninstallCommand(
        String type,
        String agentId,
        String nodeName
) {
    public AgentUninstallCommand(String agentId, String nodeName) {
        this("uninstall", agentId, nodeName);
    }
}
