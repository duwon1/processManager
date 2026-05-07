package com.example.processmanager.service;

import com.example.processmanager.dto.InstallTokenResponse;
import com.example.processmanager.entity.AgentInstallToken;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.AgentInstallTokenMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;

@Service
public class AgentInstallTokenService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Duration TOKEN_TTL = Duration.ofMinutes(5);
    private static final Duration TOKEN_RETENTION = Duration.ofDays(7);
    private static final int MAX_EXTENSIONS = 2;

    private final AgentInstallTokenMapper installTokenMapper;
    private final UserMapper userMapper;

    public AgentInstallTokenService(AgentInstallTokenMapper installTokenMapper, UserMapper userMapper) {
        this.installTokenMapper = installTokenMapper;
        this.userMapper = userMapper;
    }

    public InstallTokenResponse issueForCurrentUser() {
        User user = getCurrentUser();
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime expiresAt = now.plus(TOKEN_TTL);
        String rawToken = generateInstallToken();

        installTokenMapper.revokeUnusedForUser(user.getId(), now);
        installTokenMapper.insert(AgentInstallToken.builder()
                .userId(user.getId())
                .tokenHash(hashToken(rawToken))
                .expiresAt(expiresAt)
                .build());
        installTokenMapper.deleteExpiredBefore(now.minus(TOKEN_RETENTION));

        return new InstallTokenResponse(
                rawToken,
                expiresAt,
                TOKEN_TTL.toSeconds(),
                0,
                MAX_EXTENSIONS,
                "1회용 설치 토큰을 생성했습니다."
        );
    }

    public InstallTokenResponse extendForCurrentUser(String rawToken) {
        User user = getCurrentUser();
        LocalDateTime now = LocalDateTime.now();
        AgentInstallToken token = findActiveToken(rawToken, now);
        if (!token.getUserId().equals(user.getId())) {
            throw new SecurityException("설치 토큰을 연장할 권한이 없습니다.");
        }

        int extensionCount = token.getExtensionCount() == null ? 0 : token.getExtensionCount();
        if (extensionCount >= MAX_EXTENSIONS) {
            throw new IllegalStateException("설치 토큰은 최대 2번까지만 연장할 수 있습니다.");
        }

        LocalDateTime extendedExpiresAt = now.plus(TOKEN_TTL);
        int updated = installTokenMapper.extend(token.getId(), extendedExpiresAt, now, MAX_EXTENSIONS);
        if (updated != 1) {
            throw new IllegalStateException("설치 토큰을 연장할 수 없습니다.");
        }

        int newExtensionCount = extensionCount + 1;
        return new InstallTokenResponse(
                rawToken,
                extendedExpiresAt,
                TOKEN_TTL.toSeconds(),
                newExtensionCount,
                MAX_EXTENSIONS - newExtensionCount,
                "설치 토큰 시간을 5분으로 갱신했습니다."
        );
    }

    User consume(String rawToken, String agentId) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("설치 토큰이 필요합니다.");
        }

        LocalDateTime now = LocalDateTime.now();
        AgentInstallToken token = findActiveToken(rawToken, now);

        int updated = installTokenMapper.markUsed(token.getId(), agentId, now);
        if (updated != 1) {
            throw new SecurityException("이미 사용된 설치 토큰입니다.");
        }

        User user = userMapper.findById(token.getUserId());
        if (user == null) {
            throw new SecurityException("설치 토큰의 사용자를 찾을 수 없습니다.");
        }
        return user;
    }

    private AgentInstallToken findActiveToken(String rawToken, LocalDateTime now) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("설치 토큰이 필요합니다.");
        }
        AgentInstallToken token = installTokenMapper.findActiveByTokenHash(hashToken(rawToken.trim()), now);
        if (token == null) {
            throw new SecurityException("유효하지 않거나 만료된 설치 토큰입니다.");
        }
        return token;
    }

    private User getCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다: " + email);
        }
        return user;
    }

    private String generateInstallToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder("pmi_");
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("설치 토큰 해시 생성 실패", e);
        }
    }
}
