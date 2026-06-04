package com.example.processmanager.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NotificationRule {
    private Long id;
    private Long userId;
    private Long nodeId;
    private String nodeName;
    private String name;
    private String metricType;
    private String severity;
    private Double thresholdPercent;
    private Integer durationSeconds;
    private Integer cooldownSeconds;
    private Boolean enabled;
    private LocalDateTime firstMatchedAt;
    private LocalDateTime lastTriggeredAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
