package com.example.processmanager.controller;

import com.example.processmanager.security.JwtTokenProvider;
import com.example.processmanager.security.RefreshTokenCookieWriter;
import com.example.processmanager.service.RefreshTokenService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final RefreshTokenService refreshTokenService;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthController(RefreshTokenService refreshTokenService, JwtTokenProvider jwtTokenProvider) {
        this.refreshTokenService = refreshTokenService;
        this.jwtTokenProvider    = jwtTokenProvider;
    }

    /**
     * Refresh Token으로 Access Token을 재발급합니다.
     * Rotation 방식: 재발급 시 Refresh Token도 새로 교체합니다.
     */
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(HttpServletRequest request, HttpServletResponse response) {
        String cookieValue = extractRefreshCookie(request);
        if (cookieValue == null) {
            return unauthorizedProblem(request);
        }

        try {
            // 1. 검증 (만료/해시 불일치 시 예외)
            String email = refreshTokenService.verify(cookieValue);

            // 2. 새 Access Token 발급
            String newAccessToken = jwtTokenProvider.createAccessToken(email);

            // 3. Refresh Token Rotation: 기존 토큰 폐기 후 새로 발급
            String newCookieValue = refreshTokenService.issue(email);
            RefreshTokenCookieWriter.set(request, response, newCookieValue);

            return ResponseEntity.ok(Map.of("accessToken", newAccessToken));

        } catch (IllegalArgumentException e) {
            RefreshTokenCookieWriter.clear(request, response);
            return unauthorizedProblem(request);
        }
    }

    /**
     * 로그아웃: Refresh Token을 DB에서 폐기하고 쿠키를 삭제합니다.
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request, HttpServletResponse response) {
        String cookieValue = extractRefreshCookie(request);
        if (cookieValue != null) {
            String[] parts = cookieValue.split("\\|", 2);
            if (parts.length == 2) {
                refreshTokenService.revoke(parts[0]); // email로 폐기
            }
        }
        RefreshTokenCookieWriter.clear(request, response);
        return ResponseEntity.ok(Map.of("message", "로그아웃 되었습니다."));
    }

    // 요청 쿠키에서 refresh_token 값을 추출합니다.
    private String extractRefreshCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;
        return Arrays.stream(request.getCookies())
                .filter(c -> "refresh_token".equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private ResponseEntity<ProblemDetail> unauthorizedProblem(HttpServletRequest request) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "인증이 만료되었습니다.");
        problem.setTitle(HttpStatus.UNAUTHORIZED.getReasonPhrase());
        problem.setType(URI.create("https://procmanager/errors/auth-required"));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", "AUTH_REQUIRED");
        problem.setProperty("errorId", UUID.randomUUID().toString());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

}
