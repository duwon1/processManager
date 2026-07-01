package com.example.processmanager.controller;

import com.example.processmanager.dto.NotificationResponse;
import com.example.processmanager.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Tag(name = "Notification", description = "인앱 알림 조회·읽음 처리·삭제")
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @Operation(summary = "알림 목록 조회", description = "내 알림 목록을 반환합니다. limit로 최대 개수를 제한할 수 있습니다.")
    @GetMapping
    public ResponseEntity<List<NotificationResponse>> list(@RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(notificationService.getMine(limit));
    }

    @Operation(summary = "안 읽은 알림 수", description = "읽지 않은 알림 개수를 반환합니다.")
    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Integer>> unreadCount() {
        return ResponseEntity.ok(notificationService.getUnreadCount());
    }

    @Operation(summary = "알림 읽음 처리", description = "특정 알림을 읽음 상태로 변경합니다.")
    @PatchMapping("/{id}/read")
    public ResponseEntity<NotificationResponse> markRead(@PathVariable Long id) {
        return ResponseEntity.ok(notificationService.markRead(id));
    }

    @Operation(summary = "전체 읽음 처리", description = "내 모든 알림을 읽음 상태로 변경합니다.")
    @PatchMapping("/read-all")
    public ResponseEntity<Void> markAllRead() {
        notificationService.markAllRead();
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "알림 전체 삭제", description = "내 알림을 모두 삭제합니다.")
    @DeleteMapping
    public ResponseEntity<Void> deleteAll() {
        notificationService.deleteAllMine();
        return ResponseEntity.noContent().build();
    }
}
