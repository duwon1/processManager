package com.example.processmanager.dto;

/**
 * 서버가 에이전트로 전송하는 자동 삭제 명령입니다.
 * 노드 삭제 후 에이전트가 재접속 시 이 명령을 수신하면 자가 삭제를 수행합니다.
 */
public record AgentUninstallCommand(
        String type,
        String nodeName
) {
    public AgentUninstallCommand(String nodeName) {
        this("uninstall", nodeName);
    }
}
