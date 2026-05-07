package com.example.processmanager.controller;

import com.example.processmanager.dto.UserProfileResponse;
import com.example.processmanager.security.RefreshTokenCookieWriter;
import com.example.processmanager.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me() {
        return ResponseEntity.ok(userService.getMyProfile());
    }

    @GetMapping("/token")
    public ResponseEntity<Map<String, String>> getToken() {
        return ResponseEntity.ok(Map.of("accountToken", userService.getMyToken()));
    }

    @PostMapping("/token/reissue")
    public ResponseEntity<Map<String, String>> reissueToken() {
        String newToken = userService.reissueToken();
        return ResponseEntity.ok(Map.of(
                "accountToken", newToken,
                "message", "설치용 토큰을 재발급했습니다. 기존 에이전트는 노드 전용 secret으로 계속 연결됩니다."
        ));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Map<String, String>> deleteMe(HttpServletRequest request, HttpServletResponse response) {
        userService.deleteMyAccount();
        RefreshTokenCookieWriter.clear(request, response);
        return ResponseEntity.ok(Map.of("message", "회원탈퇴가 완료되었습니다."));
    }
}
