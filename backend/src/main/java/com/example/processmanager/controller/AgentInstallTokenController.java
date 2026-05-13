package com.example.processmanager.controller;

import com.example.processmanager.dto.InstallTokenValidationRequest;
import com.example.processmanager.dto.InstallTokenValidationResponse;
import com.example.processmanager.service.AgentInstallTokenService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/agent/install-token")
public class AgentInstallTokenController {

    private final AgentInstallTokenService installTokenService;

    public AgentInstallTokenController(AgentInstallTokenService installTokenService) {
        this.installTokenService = installTokenService;
    }

    @PostMapping("/validate")
    public ResponseEntity<InstallTokenValidationResponse> validate(@RequestBody InstallTokenValidationRequest request) {
        String installToken = request == null ? null : request.installToken();
        return ResponseEntity.ok(installTokenService.validateForInstall(installToken));
    }
}
