package com.example.processmanager.controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.Map;

@Controller
public class ApiController {
    @MessageMapping("/monitoring")
    @SendTo("/topic/monitoring")
    public List<Map<String, Object>> broadcastMetrics(List<Map<String, Object>> metrics) {
        System.out.println("에이전트로부터 수신한 실시간 데이터: " + metrics);
        return metrics;
    }

}