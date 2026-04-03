package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class RefreshToken {
    private Long id;
    private String userEmail;
    private String tokenHash;  // SHA-256(salt + raw) 저장
    private String salt;       // 랜덤 솔트
    private LocalDateTime expiresAt;
    private LocalDateTime createdAt;
}
