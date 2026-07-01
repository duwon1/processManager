package com.example.processmanager.controller;

import com.example.processmanager.dto.ExtendInstallTokenRequest;
import com.example.processmanager.dto.InstallTokenResponse;
import com.example.processmanager.dto.UserProfileResponse;
import com.example.processmanager.security.RefreshTokenCookieWriter;
import com.example.processmanager.service.AgentInstallTokenService;
import com.example.processmanager.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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

@Tag(name = "User", description = "내 프로필 및 에이전트 설치 토큰 관리")
@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;
    private final AgentInstallTokenService installTokenService;

    public UserController(UserService userService, AgentInstallTokenService installTokenService) {
        this.userService = userService;
        this.installTokenService = installTokenService;
    }

    @Operation(summary = "내 프로필 조회", description = "현재 로그인한 사용자의 프로필을 반환합니다.")
    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me() {
        return ResponseEntity.ok(userService.getMyProfile());
    }

    @Operation(summary = "설치 토큰 정책 안내", description = "설치 토큰의 유효시간·연장 정책 정보를 반환합니다. 토큰 자체는 발급하지 않습니다.")
    @GetMapping("/token")
    public ResponseEntity<Map<String, Object>> getToken() {
        return ResponseEntity.ok(Map.of(
                "message", "설치 토큰은 생성 후 한 번만 표시됩니다.",
                "expiresInSeconds", 300,
                "maxExtensions", 2
        ));
    }

    @Operation(summary = "설치 토큰 발급", description = "1회용 에이전트 설치 토큰을 발급합니다. 기존 미사용 토큰은 폐기됩니다. (5분 유효)")
    @PostMapping("/install-token")
    public ResponseEntity<InstallTokenResponse> createInstallToken() {
        return ResponseEntity.ok(installTokenService.issueForCurrentUser());
    }

    @Operation(summary = "설치 토큰 연장", description = "발급된 설치 토큰의 남은 시간을 다시 5분으로 연장합니다. (최대 2회)")
    @PostMapping("/install-token/extend")
    public ResponseEntity<InstallTokenResponse> extendInstallToken(@RequestBody ExtendInstallTokenRequest request) {
        return ResponseEntity.ok(installTokenService.extendForCurrentUser(request.installToken()));
    }

    @Operation(summary = "설치 토큰 재발급", description = "설치 토큰을 새로 발급합니다. install-token 발급과 동일하게 동작합니다.")
    @PostMapping("/token/reissue")
    public ResponseEntity<InstallTokenResponse> reissueToken() {
        return createInstallToken();
    }

    @Operation(summary = "회원 탈퇴", description = "계정과 관련 데이터를 삭제하고 refresh_token 쿠키를 제거합니다.")
    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteMe(HttpServletRequest request, HttpServletResponse response) {
        userService.deleteMyAccount();
        RefreshTokenCookieWriter.clear(request, response);
        return ResponseEntity.ok(Map.of("message", "회원탈퇴가 완료되었습니다."));
    }
}
