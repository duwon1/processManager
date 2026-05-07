package com.example.processmanager.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

import java.time.Duration;

public final class RefreshTokenCookieWriter {

    private static final String COOKIE_NAME = "refresh_token";
    private static final Duration REFRESH_TOKEN_MAX_AGE = Duration.ofDays(7);

    private RefreshTokenCookieWriter() {
    }

    public static void set(HttpServletRequest request, HttpServletResponse response, String value) {
        write(request, response, value, REFRESH_TOKEN_MAX_AGE);
    }

    public static void clear(HttpServletRequest request, HttpServletResponse response) {
        write(request, response, "", Duration.ZERO);
    }

    private static void write(HttpServletRequest request, HttpServletResponse response, String value, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(isSecureRequest(request))
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private static boolean isSecureRequest(HttpServletRequest request) {
        return request.isSecure() || "https".equalsIgnoreCase(request.getHeader("X-Forwarded-Proto"));
    }
}
