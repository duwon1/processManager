package com.example.processmanager.service;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.NotificationRuleRequest;
import com.example.processmanager.dto.NotificationRuleResponse;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.NotificationRule;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.NotificationRuleMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class NotificationRuleService {

    private static final Set<String> METRIC_TYPES = Set.of("CPU_USAGE", "GPU_USAGE", "MEMORY_USAGE", "DISK_USAGE");
    private static final String METRIC_ALERT_SEVERITY = "warning";
    private static final int MAX_DURATION_SECONDS = 3600;
    private static final int MAX_COOLDOWN_SECONDS = 86400;

    private final NotificationRuleMapper notificationRuleMapper;
    private final NodeMapper nodeMapper;
    private final UserMapper userMapper;
    private final NotificationService notificationService;

    public NotificationRuleService(
            NotificationRuleMapper notificationRuleMapper,
            NodeMapper nodeMapper,
            UserMapper userMapper,
            NotificationService notificationService
    ) {
        this.notificationRuleMapper = notificationRuleMapper;
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
        this.notificationService = notificationService;
    }

    public List<NotificationRuleResponse> getMine() {
        User user = getCurrentUser();
        return notificationRuleMapper.findByUserId(user.getId()).stream()
                .map(NotificationRuleResponse::from)
                .toList();
    }

    @Transactional
    public NotificationRuleResponse create(NotificationRuleRequest request) {
        User user = getCurrentUser();
        NotificationRule rule = normalizeRequest(request, user.getId(), null);
        notificationRuleMapper.insert(rule);
        return NotificationRuleResponse.from(notificationRuleMapper.findById(rule.getId()));
    }

    @Transactional
    public NotificationRuleResponse update(Long id, NotificationRuleRequest request) {
        User user = getCurrentUser();
        NotificationRule existing = requireOwnedRule(id, user.getId());
        NotificationRule rule = normalizeRequest(request, user.getId(), existing.getId());
        notificationRuleMapper.update(rule);
        return NotificationRuleResponse.from(notificationRuleMapper.findById(existing.getId()));
    }

    @Transactional
    public void delete(Long id) {
        User user = getCurrentUser();
        if (notificationRuleMapper.deleteByIdAndUserId(id, user.getId()) == 0) {
            throw new IllegalArgumentException("알림 규칙을 찾을 수 없습니다.");
        }
    }

    @Transactional
    public void evaluateMetrics(WebSocketAuthInterceptor.NodeSessionInfo nodeInfo, List<Map<String, Object>> metrics) {
        if (nodeInfo == null || nodeInfo.nodeId() == null || nodeInfo.userId() == null || metrics == null) {
            return;
        }

        Map<String, Double> values = Map.of(
                "CPU_USAGE", metricValue(metrics, 1, "cpu.usagePercent"),
                "GPU_USAGE", metricValue(metrics, 2, "gpu.usagePercent"),
                "MEMORY_USAGE", metricValue(metrics, 3, "memory.usagePercent"),
                "DISK_USAGE", metricValue(metrics, 4, "disk.usagePercent")
        );

        LocalDateTime now = LocalDateTime.now();
        List<NotificationRule> rules = notificationRuleMapper.findEnabledForNode(nodeInfo.userId(), nodeInfo.nodeId());
        for (NotificationRule rule : rules) {
            Double currentValue = values.get(rule.getMetricType());
            if (currentValue == null || !Double.isFinite(currentValue)) {
                continue;
            }
            evaluateRule(rule, nodeInfo, currentValue, now);
        }
    }

    private void evaluateRule(
            NotificationRule rule,
            WebSocketAuthInterceptor.NodeSessionInfo nodeInfo,
            double currentValue,
            LocalDateTime now
    ) {
        if (currentValue < safeDouble(rule.getThresholdPercent())) {
            if (rule.getFirstMatchedAt() != null) {
                notificationRuleMapper.clearFirstMatchedAt(rule.getId());
            }
            return;
        }

        LocalDateTime firstMatchedAt = rule.getFirstMatchedAt();
        if (firstMatchedAt == null) {
            firstMatchedAt = now;
            notificationRuleMapper.updateFirstMatchedAt(rule.getId(), firstMatchedAt);
        }

        int durationSeconds = safeInt(rule.getDurationSeconds());
        if (durationSeconds > 0 && firstMatchedAt.plusSeconds(durationSeconds).isAfter(now)) {
            return;
        }

        int cooldownSeconds = safeInt(rule.getCooldownSeconds());
        LocalDateTime lastTriggeredAt = rule.getLastTriggeredAt();
        if (lastTriggeredAt != null && lastTriggeredAt.plusSeconds(cooldownSeconds).isAfter(now)) {
            return;
        }

        String metricLabel = metricLabel(rule.getMetricType());
        String nodeName = nodeInfo.nodeName() == null || nodeInfo.nodeName().isBlank() ? "노드" : nodeInfo.nodeName();
        String title = rule.getName() == null || rule.getName().isBlank()
                ? metricLabel + " 알림"
                : rule.getName();
        String message = String.format(
                Locale.KOREA,
                "%s의 %s이 %.1f%%입니다. 기준 %.1f%% 이상이 %d초 동안 유지됐습니다.",
                nodeName,
                metricLabel,
                currentValue,
                safeDouble(rule.getThresholdPercent()),
                durationSeconds
        );

        notificationService.createPersistent(
                rule.getUserId(),
                "METRIC_ALERT",
                METRIC_ALERT_SEVERITY,
                title,
                message,
                "/dashboard/" + nodeInfo.nodeId(),
                "NODE",
                nodeInfo.nodeId(),
                "notification-rule:" + rule.getId()
        );
        notificationRuleMapper.markTriggered(rule.getId(), now);
    }

    private NotificationRule normalizeRequest(NotificationRuleRequest request, Long userId, Long id) {
        if (request == null) {
            throw new IllegalArgumentException("알림 규칙 정보가 없습니다.");
        }

        String metricType = normalizeUpper(request.metricType());
        if (!METRIC_TYPES.contains(metricType)) {
            throw new IllegalArgumentException("지원하지 않는 알림 지표입니다.");
        }

        double threshold = request.thresholdPercent() == null ? 80.0 : request.thresholdPercent();
        if (!Double.isFinite(threshold) || threshold <= 0 || threshold > 100) {
            throw new IllegalArgumentException("임계값은 0보다 크고 100 이하로 입력해야 합니다.");
        }

        int durationSeconds = clamp(request.durationSeconds() == null ? 60 : request.durationSeconds(), 0, MAX_DURATION_SECONDS);
        int cooldownSeconds = clamp(request.cooldownSeconds() == null ? 300 : request.cooldownSeconds(), 30, MAX_COOLDOWN_SECONDS);
        Long nodeId = request.nodeId();
        if (nodeId != null) {
            Node node = nodeMapper.findPermittedByUserIdAndNodeId(userId, nodeId, NodeAccessPermission.VIEW_MONITORING.name());
            if (node == null) {
                throw new SecurityException("접근 권한이 없는 노드입니다.");
            }
        }

        String name = request.name() == null ? "" : request.name().trim();
        if (name.isBlank()) {
            name = metricLabel(metricType) + " " + formatThreshold(threshold) + "% 이상";
        }
        if (name.length() > 120) {
            name = name.substring(0, 120);
        }

        return NotificationRule.builder()
                .id(id)
                .userId(userId)
                .nodeId(nodeId)
                .name(name)
                .metricType(metricType)
                .severity(METRIC_ALERT_SEVERITY)
                .thresholdPercent(threshold)
                .durationSeconds(durationSeconds)
                .cooldownSeconds(cooldownSeconds)
                .enabled(!Boolean.FALSE.equals(request.enabled()))
                .build();
    }

    private NotificationRule requireOwnedRule(Long id, Long userId) {
        NotificationRule existing = notificationRuleMapper.findById(id);
        if (existing == null || !userId.equals(existing.getUserId())) {
            throw new IllegalArgumentException("알림 규칙을 찾을 수 없습니다.");
        }
        return existing;
    }

    private User getCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        }
        return user;
    }

    private Double metricValue(List<Map<String, Object>> metrics, int id, String key) {
        for (Map<String, Object> metric : metrics) {
            Object metricId = metric.get("id");
            Object metricKey = metric.get("key");
            boolean matchesId = metricId instanceof Number number && number.intValue() == id;
            boolean matchesKey = key.equals(metricKey);
            if (matchesId || matchesKey) {
                Object rawValue = metric.get("rawValue");
                if (rawValue == null) {
                    rawValue = metric.get("value");
                }
                return parsePercent(rawValue);
            }
        }
        return Double.NaN;
    }

    private Double parsePercent(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value == null) {
            return Double.NaN;
        }
        String text = String.valueOf(value).replace("%", "").trim();
        if (text.isBlank()) {
            return Double.NaN;
        }
        try {
            return Double.parseDouble(text);
        } catch (NumberFormatException ignored) {
            return Double.NaN;
        }
    }

    private String metricLabel(String metricType) {
        return switch (metricType) {
            case "CPU_USAGE" -> "CPU 사용률";
            case "GPU_USAGE" -> "GPU 사용률";
            case "MEMORY_USAGE" -> "메모리 사용률";
            case "DISK_USAGE" -> "디스크 사용률";
            default -> "시스템 지표";
        };
    }

    private String normalizeUpper(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private double safeDouble(Double value) {
        return value == null ? 0.0 : value;
    }

    private String formatThreshold(double threshold) {
        return threshold == Math.rint(threshold)
                ? String.valueOf((int) threshold)
                : String.format(Locale.KOREA, "%.1f", threshold);
    }
}
