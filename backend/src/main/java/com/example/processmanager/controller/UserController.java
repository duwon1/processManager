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

    // 계정 토큰을 재발급합니다. 이전 토큰은 신규 등록에 더 이상 사용할 수 없습니다.
    @PostMapping("/token/reissue")
    public ResponseEntity<Map<String, String>> reissueToken() {
        String newToken = userService.reissueToken();
        return ResponseEntity.ok(Map.of(
                "accountToken", newToken,
                "message", "새 설치용 토큰이 재발급되었습니다. 기존 에이전트는 노드 전용 secret으로 계속 연결됩니다."
        ));
    }
}
