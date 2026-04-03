package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class RefreshToken {
    private Long id;
    private String userEmail;
    private String tokenHash;      // SHA-256(salt + raw) 저장 (현재 토큰)
    private String salt;           // 랜덤 솔트 (현재 토큰)
    private String prevTokenHash;  // 이전 토큰 해시 (Grace Period 용)
    private String prevSalt;       // 이전 토큰 솔트 (Grace Period 용)
    private LocalDateTime replacedAt; // 토큰 교체 시각 (Grace Period 기준점)
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
}
