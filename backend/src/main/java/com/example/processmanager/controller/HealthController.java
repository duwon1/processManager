package com.example.processmanager.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.Map;

@Tag(name = "Health", description = "헬스 체크 (공개)")
@SecurityRequirements
@RestController
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);
    // DB 응답 대기 상한(초). 헬스 체크가 오래 매달려 있지 않도록 짧게 둡니다.
    private static final int DB_CHECK_TIMEOUT_SECONDS = 2;

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    // Render 헬스 체크(render.yaml healthCheckPath)는 이 경로를 씁니다. DB가 잠깐 끊겨도 앱이 재시작되지 않도록
    // 프로세스 생존만 확인하고, DB 상태는 /health/ready에서 따로 확인합니다.
    @Operation(summary = "헬스 체크", description = "서버 프로세스가 살아 있으면 200 {\"status\":\"ok\"}를 반환합니다.")
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @Operation(summary = "준비 상태 확인", description = "DB 연결까지 확인합니다. 정상이면 200 {\"status\":\"ok\"}, DB 연결 실패 시 503 {\"status\":\"error\",\"db\":\"down\"}.")
    @GetMapping("/health/ready")
    public ResponseEntity<Map<String, String>> ready() {
        // 커넥션 풀에서 연결을 하나 꺼내 유효성만 확인하는 가벼운 검사입니다.
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(DB_CHECK_TIMEOUT_SECONDS)) {
                return ResponseEntity.ok(Map.of("status", "ok"));
            }
        } catch (Exception e) {
            log.warn("헬스 체크 DB 연결 실패: {}", e.getMessage());
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "error", "db", "down"));
    }
}
