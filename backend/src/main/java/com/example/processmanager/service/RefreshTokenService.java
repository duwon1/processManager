package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HexFormat;

/**
 * Refresh Token의 발급·검증·폐기를 담당합니다.
 *
 * <p>보안 설계: DB에는 원문이 아닌 {@code SHA-256(salt + rawToken)} 해시만 저장하고,
 * 쿠키에는 {@code "{email}|{rawToken}"} 형태의 원문을 HttpOnly로 담습니다.
 * 재발급 시 토큰을 회전(rotation)하되, 빠른 새로고침의 경쟁 상태를 위해 교체 후
 * 10초({@code GRACE_PERIOD_SECONDS}) 동안은 직전 토큰도 허용합니다.
 * 현재·직전 토큰 모두 불일치하면 탈취 시도로 보고 저장소에서 즉시 폐기합니다.</p>
 */
@Service
public class RefreshTokenService {

    private static final int TOKEN_BYTES = 32; // 256비트 랜덤 토큰
    private static final int SALT_BYTES  = 16; // 128비트 솔트
    private static final int EXPIRE_DAYS = 7;

    private final RefreshTokenStore refreshTokenStore;

    public RefreshTokenService(RefreshTokenStore refreshTokenStore) {
        this.refreshTokenStore = refreshTokenStore;
    }

    /**
     * Refresh Token을 발급하고 DB에 저장합니다.
     * 쿠키에 담을 값은 "{email}|{rawToken}" 형태입니다.
     * DB에는 SHA-256(salt + rawToken) 해시값만 저장합니다.
     */
    public String issue(String userEmail) {
        String raw  = generateHex(TOKEN_BYTES);
        String salt = generateHex(SALT_BYTES);
        String hash = sha256(salt + raw);

        refreshTokenStore.upsert(RefreshToken.builder()
                .userEmail(userEmail)
                .tokenHash(hash)
                .salt(salt)
                .expiresAt(LocalDateTime.now().plusDays(EXPIRE_DAYS))
                .build());

        // 이메일과 원문 토큰을 합쳐 쿠키에 저장 (HttpOnly 쿠키라 JS에서 접근 불가)
        return userEmail + "|" + raw;
    }

    // Grace Period: 토큰 교체 후 이 시간(초) 안에는 구 토큰도 허용
    private static final int GRACE_PERIOD_SECONDS = 10;

    /**
     * 쿠키 값을 검증하고 유효하면 이메일을 반환합니다.
     * 1순위: 현재 토큰 해시 일치
     * 2순위: Grace Period(10초) 내 이전 토큰 해시 일치 (빠른 새로고침 대응)
     * 만료되었거나 해시가 불일치하면 예외를 던집니다.
     */
    public String verify(String cookieValue) {
        String[] parts = cookieValue.split("\\|", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("잘못된 토큰 형식입니다.");
        }

        String email = parts[0];
        String raw   = parts[1];

        RefreshToken stored = refreshTokenStore.findByUserEmail(email);
        if (stored == null) {
            throw new IllegalArgumentException("존재하지 않는 토큰입니다.");
        }

        // 만료 확인
        if (stored.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenStore.deleteByUserEmail(email);
            throw new IllegalArgumentException("만료된 토큰입니다.");
        }

        // 1순위: 현재 토큰 검증
        String expectedHash = sha256(stored.getSalt() + raw);
        if (expectedHash.equals(stored.getTokenHash())) {
            return email;
        }

        // 2순위: Grace Period 내 이전 토큰 검증 (빠른 새로고침 Race Condition 대응)
        if (stored.getPrevTokenHash() != null && stored.getReplacedAt() != null) {
            boolean withinGrace = stored.getReplacedAt()
                    .isAfter(LocalDateTime.now().minusSeconds(GRACE_PERIOD_SECONDS));
            if (withinGrace) {
                String prevExpectedHash = sha256(stored.getPrevSalt() + raw);
                if (prevExpectedHash.equals(stored.getPrevTokenHash())) {
                    return email;
                }
            }
        }

        // 모두 불일치: 토큰 탈취 시도일 수 있으므로 즉시 폐기
        refreshTokenStore.deleteByUserEmail(email);
        throw new IllegalArgumentException("토큰 검증에 실패했습니다.");
    }

    /**
     * 로그아웃용 검증입니다. 쿠키 토큰이 저장된 해시와 일치할 때만 폐기합니다.
     * 불일치 토큰은 다른 사용자의 세션을 지우는 데 악용될 수 있어 저장소를 변경하지 않습니다.
     */
    public boolean revokeIfValid(String cookieValue) {
        String[] parts = cookieValue.split("\\|", 2);
        if (parts.length != 2) {
            return false;
        }

        String email = parts[0];
        String raw = parts[1];
        RefreshToken stored = refreshTokenStore.findByUserEmail(email);
        if (stored == null || stored.getExpiresAt().isBefore(LocalDateTime.now())) {
            return false;
        }

        if (matchesCurrentOrPreviousToken(stored, raw)) {
            refreshTokenStore.deleteByUserEmail(email);
            return true;
        }
        return false;
    }

    /**
     * 해당 유저의 Refresh Token을 폐기합니다. (로그아웃 시 호출)
     */
    public void revoke(String userEmail) {
        refreshTokenStore.deleteByUserEmail(userEmail);
    }

    // SecureRandom으로 랜덤 바이트를 생성하고 hex 문자열로 반환합니다.
    private String generateHex(int byteLength) {
        byte[] bytes = new byte[byteLength];
        new SecureRandom().nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    // SHA-256 해시를 hex 문자열로 반환합니다.
    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 알고리즘을 사용할 수 없습니다.", e);
        }
    }

    private boolean matchesCurrentOrPreviousToken(RefreshToken stored, String raw) {
        String expectedHash = sha256(stored.getSalt() + raw);
        if (expectedHash.equals(stored.getTokenHash())) {
            return true;
        }

        if (stored.getPrevTokenHash() == null || stored.getPrevSalt() == null || stored.getReplacedAt() == null) {
            return false;
        }
        boolean withinGrace = stored.getReplacedAt()
                .isAfter(LocalDateTime.now().minusSeconds(GRACE_PERIOD_SECONDS));
        return withinGrace && sha256(stored.getPrevSalt() + raw).equals(stored.getPrevTokenHash());
    }
}
