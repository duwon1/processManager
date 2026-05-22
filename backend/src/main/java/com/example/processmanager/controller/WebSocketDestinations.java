package com.example.processmanager.controller;

final class WebSocketDestinations {

    private WebSocketDestinations() {
    }

    static String nodeTopic(Long nodeId, String suffix) {
        return "/topic/node." + nodeId + "." + suffix;
    }

    static String userTopic(Long userId, String suffix) {
        return "/topic/user." + userId + "." + suffix;
    }

    static String agentCommandDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 명령을 전송할 수 없습니다.");
        }
        return "/topic/agent.command." + agentId;
    }

    static String agentSysinfoDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 시스템 정보 요청을 전송할 수 없습니다.");
        }
        return "/topic/agent.sysinfo-request." + agentId;
    }

    static String agentDeviceManagerDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 장치 관리자 정보 요청을 전송할 수 없습니다.");
        }
        return "/topic/agent.device-manager-request." + agentId;
    }

    static String safeClientMessage(Exception e) {
        if (e instanceof SecurityException) {
            return "권한이 없습니다.";
        }
        if (e instanceof IllegalStateException) {
            return "요청을 처리할 수 없습니다.";
        }
        return "요청 처리 중 문제가 발생했습니다.";
    }
}
