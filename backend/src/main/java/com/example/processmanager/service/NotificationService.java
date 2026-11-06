package com.example.processmanager.service;

import com.example.processmanager.dto.NotificationResponse;
import com.example.processmanager.entity.Notification;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NotificationMapper;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class NotificationService {

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final NotificationMapper notificationMapper;
    private final CurrentUserProvider currentUserProvider;
    private final SimpMessagingTemplate messagingTemplate;

    public NotificationService(
            NotificationMapper notificationMapper,
            CurrentUserProvider currentUserProvider,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.notificationMapper = notificationMapper;
        this.currentUserProvider = currentUserProvider;
        this.messagingTemplate = messagingTemplate;
    }

    public List<NotificationResponse> getMine(Integer limit) {
        User user = currentUserProvider.requireCurrentUser();
        int resolvedLimit = normalizeLimit(limit);
        return notificationMapper.findByUserId(user.getId(), resolvedLimit).stream()
                .map(NotificationResponse::from)
                .toList();
    }

    public Map<String, Integer> getUnreadCount() {
        User user = currentUserProvider.requireCurrentUser();
        return Map.of("count", notificationMapper.countUnreadByUserId(user.getId()));
    }

    @Transactional
    public NotificationResponse markRead(Long id) {
        User user = currentUserProvider.requireCurrentUser();
        notificationMapper.markRead(id, user.getId());
        Notification notification = notificationMapper.findById(id);
        if (notification == null || !user.getId().equals(notification.getUserId())) {
            throw new IllegalArgumentException("알림을 찾을 수 없습니다.");
        }
        NotificationResponse response = NotificationResponse.from(notification);
        broadcastUnreadCount(user.getId());
        return response;
    }

    @Transactional
    public void markAllRead() {
        User user = currentUserProvider.requireCurrentUser();
        notificationMapper.markAllRead(user.getId());
        broadcastUnreadCount(user.getId());
    }

    @Transactional
    public void deleteAllMine() {
        User user = currentUserProvider.requireCurrentUser();
        notificationMapper.deleteAllByUserId(user.getId());
        broadcastUnreadCount(user.getId());
    }

    @Transactional
    public NotificationResponse createPersistent(
            Long userId,
            String type,
            String severity,
            String title,
            String message,
            String actionUrl,
            String entityType,
            Long entityId,
            String dedupeKey
    ) {
        if (userId == null) {
            throw new IllegalArgumentException("알림 대상 사용자가 없습니다.");
        }

        Notification notification = Notification.builder()
                .userId(userId)
                .type(type)
                .severity(severity)
                .title(title)
                .message(message)
                .actionUrl(actionUrl)
                .entityType(entityType)
                .entityId(entityId)
                .dedupeKey(dedupeKey)
                .build();

        Notification existing = null;
        if (dedupeKey != null && !dedupeKey.isBlank()) {
            existing = notificationMapper.findByUserIdAndDedupeKey(userId, dedupeKey);
        }

        if (existing == null) {
            notificationMapper.insert(notification);
        } else {
            notification.setId(existing.getId());
            notificationMapper.updateExisting(notification);
        }

        Notification persisted = notificationMapper.findById(notification.getId());
        NotificationResponse response = NotificationResponse.from(persisted);
        broadcastCreated(userId, response);
        broadcastUnreadCount(userId);
        return response;
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_LIMIT;
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private void broadcastCreated(Long userId, NotificationResponse notification) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "created");
        payload.put("notification", notification);
        messagingTemplate.convertAndSend(userTopic(userId), (Object) payload);
    }

    private void broadcastUnreadCount(Long userId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "unread-count");
        payload.put("count", notificationMapper.countUnreadByUserId(userId));
        messagingTemplate.convertAndSend(userTopic(userId), (Object) payload);
    }

    private String userTopic(Long userId) {
        return "/topic/user." + userId + ".notifications";
    }
}
