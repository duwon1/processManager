package com.example.processmanager.security;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import com.example.processmanager.service.RefreshTokenService;
import com.example.processmanager.service.UserService;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import org.springframework.beans.factory.annotation.Value;
import java.io.IOException;

@Component
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final JwtTokenProvider jwtTokenProvider;
    private final UserService userService;
    private final RefreshTokenService refreshTokenService;

    // OAuth2 로그인 완료 후 리다이렉트할 프론트엔드 URL (환경별로 변경 가능)
    @Value("${app.oauth2.redirect-uri:http://localhost:5173/oauth2/redirect}")
    private String oauth2RedirectUri;

    public OAuth2SuccessHandler(JwtTokenProvider jwtTokenProvider, UserService userService,
                                RefreshTokenService refreshTokenService) {
        this.jwtTokenProvider   = jwtTokenProvider;
        this.userService        = userService;
        this.refreshTokenService = refreshTokenService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {

        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email   = oAuth2User.getAttribute("email");
        String name    = oAuth2User.getAttribute("name");
        String picture = oAuth2User.getAttribute("picture");

        userService.saveOrUpdate(email, name, picture);

        // 1. Access Token 발급 (30분)
        String accessToken = jwtTokenProvider.createAccessToken(email);

        // 2. Refresh Token 발급 및 DB 저장 (salt+해시 방식), 쿠키에 원문 저장
        String refreshCookieValue = refreshTokenService.issue(email);
        Cookie refreshCookie = new Cookie("refresh_token", refreshCookieValue);
        refreshCookie.setHttpOnly(true);
        refreshCookie.setPath("/");
        refreshCookie.setMaxAge(7 * 24 * 60 * 60);
        response.addCookie(refreshCookie);

        // 3. Access Token은 URL 파라미터에 담아서 리액트 프론트엔드로 리다이렉트
        String targetUrl = UriComponentsBuilder.fromUriString(oauth2RedirectUri)
                .queryParam("accessToken", accessToken)
                .build().toUriString();

        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }
}