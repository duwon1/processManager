package com.example.processmanager.controller;

import com.example.processmanager.dto.ExtendInstallTokenRequest;
import com.example.processmanager.dto.InstallTokenResponse;
import com.example.processmanager.dto.UserProfileResponse;
import com.example.processmanager.security.RefreshTokenCookieWriter;
import com.example.processmanager.service.AgentInstallTokenService;
import com.example.processmanager.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;
    private final AgentInstallTokenService installTokenService;

    public UserController(UserService userService, AgentInstallTokenService installTokenService) {
        this.userService = userService;
        this.installTokenService = installTokenService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me() {
        return ResponseEntity.ok(userService.getMyProfile());
    }

    @GetMapping("/token")
    public ResponseEntity<Map<String, Object>> getToken() {
        return ResponseEntity.ok(Map.of(
                "message", "설치 토큰은 생성 후 한 번만 표시됩니다.",
                "expiresInSeconds", 300,
                "maxExtensions", 2
        ));
    }

    @PostMapping("/install-token")
    public ResponseEntity<InstallTokenResponse> createInstallToken() {
        return ResponseEntity.ok(installTokenService.issueForCurrentUser());
    }

    @PostMapping("/install-token/extend")
    public ResponseEntity<InstallTokenResponse> extendInstallToken(@RequestBody ExtendInstallTokenRequest request) {
        return ResponseEntity.ok(installTokenService.extendForCurrentUser(request.installToken()));
    }

    @PostMapping("/token/reissue")
    public ResponseEntity<InstallTokenResponse> reissueToken() {
        return createInstallToken();
    }

    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteMe(HttpServletRequest request, HttpServletResponse response) {
        userService.deleteMyAccount();
        RefreshTokenCookieWriter.clear(request, response);
        return ResponseEntity.ok(Map.of("message", "회원탈퇴가 완료되었습니다."));
    }
}
