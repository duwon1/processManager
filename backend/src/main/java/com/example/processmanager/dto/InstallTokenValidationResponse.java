package com.example.processmanager.dto;

public record InstallTokenValidationResponse(
        boolean valid,
        String code,
        String message
) {
    public static InstallTokenValidationResponse success() {
        return new InstallTokenValidationResponse(true, "OK", "설치 명령어 확인 완료");
    }

    public static InstallTokenValidationResponse invalid(String code, String message) {
        return new InstallTokenValidationResponse(false, code, message);
    }
}
