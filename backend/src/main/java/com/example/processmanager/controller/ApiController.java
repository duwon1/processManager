package com.example.processmanager.controller;

import com.example.processmanager.dto.MonitoringDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api")
public class ApiController {

    @PostMapping("/monitoring")
    public ResponseEntity<String> receiveMonitoringData(@RequestBody MonitoringDto dto) {
        // 수신 데이터 로그 출력
        log.info(">>>> [수신 성공] Host: {}, CPU: {}%",
                dto.getHostname(),
                dto.getCpu().getUsage_percent());

        // 여기서 비즈니스 로직(DB 저장 등)을 처리하면 됩니다.

        return ResponseEntity.ok("Success");
    }
}
