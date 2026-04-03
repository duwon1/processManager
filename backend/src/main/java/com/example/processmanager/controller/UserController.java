package com.example.processmanager.controller;

import com.example.processmanager.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    // 현재 사용자의 계정 토큰을 조회합니다.
    @GetMapping("/token")
    public ResponseEntity<Map<String, String>> getToken() {
        return ResponseEntity.ok(Map.of("accountToken", userService.getMyToken()));
    }

    // 계정 토큰을 재발급합니다. 기존 토큰은 즉시 무효화됩니다.
    @PostMapping("/token/reissue")
    public ResponseEntity<Map<String, String>> reissueToken() {
        String newToken = userService.reissueToken();
        return ResponseEntity.ok(Map.of(
                "accountToken", newToken,
                "message", "토큰이 재발급되었습니다. 모든 에이전트 설정을 업데이트해주세요."
        ));
    }
}
