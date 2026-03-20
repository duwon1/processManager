package com.example.processmanager.controller;

import com.example.processmanager.dto.MonitoringDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List; // List 추가 필수!

@Slf4j
@RestController
@RequestMapping("/api")
public class ApiController {

    @PostMapping("/monitoring")
    // 💡 여기가 핵심! List<MonitoringDto> 로 받아야 배열 파싱 에러가 안 납니다.
    public ResponseEntity<String> receiveMonitoringData(@RequestBody List<MonitoringDto> metrics) {

        log.info(">>>> [데이터 수신 성공] 총 {} 개의 지표가 도착했습니다.", metrics.size());

        for (MonitoringDto metric : metrics) {
            log.info(" - [{}]: {}", metric.getTitle(), metric.getValue());
        }

        return ResponseEntity.ok("Success");
    }
}