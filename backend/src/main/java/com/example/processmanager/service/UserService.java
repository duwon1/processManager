package com.example.processmanager.service;

import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;

@Service
public class UserService {

    private final UserMapper userMapper;

    public UserService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    // "pm_" 접두사 + SecureRandom 32바이트 Hex 조합으로 토큰을 생성합니다. (총 67자)
    // 접두사를 붙이면 실수로 노출됐을 때 어느 서비스 토큰인지 즉시 식별 가능합니다.
    private String generateToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        StringBuilder hex = new StringBuilder("pm_");
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    // 신규 사용자는 account_token을 자동 발급하고, 기존 사용자는 프로필 정보만 업데이트합니다.
    public void saveOrUpdate(String email, String name, String picture) {
        User existing = userMapper.findByEmail(email);
        if (existing == null) {
            userMapper.insert(User.builder()
                    .email(email)
                    .name(name)
                    .picture(picture)
                    .accountToken(generateToken()) // 첫 로그인 시 토큰 자동 발급
                    .build());
        } else {
            userMapper.update(User.builder()
                    .email(email)
                    .name(name)
                    .picture(picture)
                    .build());
        }
    }

    // 현재 로그인한 사용자의 계정 토큰을 조회합니다.
    public String getMyToken() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) throw new IllegalStateException("사용자를 찾을 수 없습니다: " + email);
        return user.getAccountToken();
    }

    // 새 설치에 쓸 토큰을 재발급하되, 기존 설치 에이전트가 끊기지 않도록 이전 토큰은 인증용으로 보존합니다.
    public String reissueToken() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) throw new IllegalStateException("사용자를 찾을 수 없습니다: " + email);
        String newToken = generateToken();
        if (user.getAccountToken() != null && !user.getAccountToken().isBlank()) {
            userMapper.insertLegacyAccountToken(user.getId(), user.getAccountToken());
        }
        userMapper.updateAccountToken(email, newToken);
        return newToken;
    }
}
