package com.example.processmanager.controller;

import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController // JSON을 보내기 위한 컨트롤러
@RequestMapping("/api")
public class MonitoringController {

    @GetMapping("/hello")
    public String getDashboard(Model model) {

        return "Hello from Spring Boot!"; // templates/dashboard.html 파일을 찾아감
    }
}
