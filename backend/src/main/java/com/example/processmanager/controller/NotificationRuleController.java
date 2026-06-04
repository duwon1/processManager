package com.example.processmanager.controller;

import com.example.processmanager.dto.NotificationRuleRequest;
import com.example.processmanager.dto.NotificationRuleResponse;
import com.example.processmanager.service.NotificationRuleService;
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

@RestController
@RequestMapping("/api/notification-rules")
public class NotificationRuleController {

    private final NotificationRuleService notificationRuleService;

    public NotificationRuleController(NotificationRuleService notificationRuleService) {
        this.notificationRuleService = notificationRuleService;
    }

    @GetMapping
    public ResponseEntity<List<NotificationRuleResponse>> list() {
        return ResponseEntity.ok(notificationRuleService.getMine());
    }

    @PostMapping
    public ResponseEntity<NotificationRuleResponse> create(@RequestBody NotificationRuleRequest request) {
        return ResponseEntity.ok(notificationRuleService.create(request));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<NotificationRuleResponse> update(
            @PathVariable Long id,
            @RequestBody NotificationRuleRequest request
    ) {
        return ResponseEntity.ok(notificationRuleService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        notificationRuleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
