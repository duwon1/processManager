package com.example.processmanager.controller;

import com.example.processmanager.dto.InstallTokenValidationRequest;
import com.example.processmanager.dto.InstallTokenValidationResponse;
import com.example.processmanager.service.AgentInstallTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AgentInstallToken", description = "에이전트 설치 스크립트용 토큰 검증·선점 (공개)")
@SecurityRequirements // 설치 스크립트가 로그인 없이 호출하므로 bearer 인증이 필요 없습니다.
@RestController
@RequestMapping("/api/agent/install-token")
public class AgentInstallTokenController {

    private final AgentInstallTokenService installTokenService;

    public AgentInstallTokenController(AgentInstallTokenService installTokenService) {
        this.installTokenService = installTokenService;
    }

    @Operation(summary = "설치 토큰 검증", description = "설치 토큰의 유효성만 확인합니다. 토큰을 소비하지 않습니다.")
    @PostMapping("/validate")
    public ResponseEntity<InstallTokenValidationResponse> validate(@RequestBody InstallTokenValidationRequest request) {
        String installToken = request == null ? null : request.installToken();
        return ResponseEntity.ok(installTokenService.validateForInstall(installToken));
    }

    @Operation(summary = "설치 토큰 선점(claim)", description = "설치 토큰을 특정 agentId에 원자적으로 묶어 다른 에이전트의 재사용을 막습니다.")
    @PostMapping("/claim")
    public ResponseEntity<InstallTokenValidationResponse> claim(@RequestBody InstallTokenValidationRequest request) {
        String installToken = request == null ? null : request.installToken();
        String agentId = request == null ? null : request.agentId();
        return ResponseEntity.ok(installTokenService.claimForInstall(installToken, agentId));
    }
}
