package com.example.processmanager.dto;

import java.time.LocalDateTime;

public record InstallTokenResponse(
        String installToken,
        LocalDateTime expiresAt,
        long expiresInSeconds,
        int extensionCount,
        int remainingExtensions,
        String message
) {
}
