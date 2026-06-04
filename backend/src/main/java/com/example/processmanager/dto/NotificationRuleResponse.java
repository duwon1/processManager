package com.example.processmanager.dto;

import com.example.processmanager.entity.NotificationRule;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class NotificationRuleResponse {
    private Long id;
    private Long nodeId;
    private String nodeName;
    private String name;
    private String metricType;
    private String severity;
    private Double thresholdPercent;
    private Integer durationSeconds;
    private Integer cooldownSeconds;
    private Boolean enabled;
    private LocalDateTime lastTriggeredAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static NotificationRuleResponse from(NotificationRule rule) {
        return NotificationRuleResponse.builder()
                .id(rule.getId())
                .nodeId(rule.getNodeId())
                .nodeName(rule.getNodeName())
                .name(rule.getName())
                .metricType(rule.getMetricType())
                .severity(rule.getSeverity())
                .thresholdPercent(rule.getThresholdPercent())
                .durationSeconds(rule.getDurationSeconds())
                .cooldownSeconds(rule.getCooldownSeconds())
                .enabled(Boolean.TRUE.equals(rule.getEnabled()))
                .lastTriggeredAt(rule.getLastTriggeredAt())
                .createdAt(rule.getCreatedAt())
                .updatedAt(rule.getUpdatedAt())
                .build();
    }
}
