package com.example.processmanager.controller;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

final class WebSocketDestinations {

    private WebSocketDestinations() {
    }

    // 에이전트 payload를 브라우저 topic으로 재전송하기 전에 agentId와 secret/token류 필드를 제거합니다.
    // agentId를 알면 /topic/agent.command.{agentId}를 노릴 수 있어 브라우저에는 노출하지 않습니다.
    static Map<String, Object> withoutAgentCredentials(Map<String, Object> data) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (data == null) {
            return result;
        }
        data.forEach((key, value) -> {
            if (key == null) {
                return;
            }
            String normalized = key.toLowerCase(Locale.ROOT).replace("-", "").replace("_", "");
            if (normalized.equals("agentid") || normalized.contains("secret") || normalized.contains("token")) {
                return;
            }
            result.put(key, value);
        });
        return result;
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

    static String agentServiceRequestDestination(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalStateException("agent-id가 없어 서비스 목록 요청을 전송할 수 없습니다.");
        }
        return "/topic/agent.service-request." + agentId;
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
