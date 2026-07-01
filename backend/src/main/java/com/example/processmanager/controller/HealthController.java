package com.example.processmanager.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Tag(name = "Health", description = "헬스 체크 (공개)")
@SecurityRequirements
@RestController
public class HealthController {

    @Operation(summary = "헬스 체크", description = "서버 상태를 반환합니다. 항상 {\"status\":\"ok\"}.")
    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
