package com.example.processmanager.controller;

import com.example.processmanager.dto.NotificationRuleRequest;
import com.example.processmanager.dto.NotificationRuleResponse;
import com.example.processmanager.service.NotificationRuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "NotificationRule", description = "지표 임계치 기반 알림 규칙 CRUD")
@RestController
@RequestMapping("/api/notification-rules")
public class NotificationRuleController {

    private final NotificationRuleService notificationRuleService;

    public NotificationRuleController(NotificationRuleService notificationRuleService) {
        this.notificationRuleService = notificationRuleService;
    }

    @Operation(summary = "알림 규칙 목록", description = "내 알림 규칙 목록을 반환합니다.")
    @GetMapping
    public ResponseEntity<List<NotificationRuleResponse>> list() {
        return ResponseEntity.ok(notificationRuleService.getMine());
    }

    @Operation(summary = "알림 규칙 생성", description = "지표 임계치·지속시간·쿨다운 기반 알림 규칙을 생성합니다.")
    @PostMapping
    public ResponseEntity<NotificationRuleResponse> create(@RequestBody NotificationRuleRequest request) {
        return ResponseEntity.ok(notificationRuleService.create(request));
    }

    @Operation(summary = "알림 규칙 수정", description = "기존 알림 규칙을 수정합니다.")
    @PatchMapping("/{id}")
    public ResponseEntity<NotificationRuleResponse> update(
            @PathVariable Long id,
            @RequestBody NotificationRuleRequest request
    ) {
        return ResponseEntity.ok(notificationRuleService.update(id, request));
    }

    @Operation(summary = "알림 규칙 삭제", description = "알림 규칙을 삭제합니다.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        notificationRuleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
