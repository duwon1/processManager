package com.example.processmanager.dto;

public record NotificationRuleRequest(
        String name,
        Long nodeId,
        String metricType,
        String severity,
        Double thresholdPercent,
        Integer durationSeconds,
        Integer cooldownSeconds,
        Boolean enabled
) {
}
