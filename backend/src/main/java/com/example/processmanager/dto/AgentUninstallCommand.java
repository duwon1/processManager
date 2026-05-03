package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 자동 삭제 명령입니다.
 * agentId별 전용 topic으로 전송하며, 수신한 에이전트가 자가 삭제를 수행합니다.
 */
public record AgentUninstallCommand(
        String type,
        String nodeName
) {
    public AgentUninstallCommand(String nodeName) {
        this("uninstall", nodeName);
    }
}
