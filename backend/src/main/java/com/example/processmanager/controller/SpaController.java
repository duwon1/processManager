package com.example.processmanager.controller;

import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * SPA(Single Page Application) 라우팅 지원 컨트롤러입니다.
 * /api/**, WebSocket, 정적 파일(확장자 있는 경로)을 제외한 모든 GET 요청을
 * index.html로 포워딩하여 React Router가 클라이언트 사이드 라우팅을 처리하게 합니다.
 * 이를 통해 /main, /dashboard/123 등 React 경로를 URL 직접 입력 시에도 정상 동작합니다.
 */
@Hidden // SPA 포워딩용 라우트이므로 API 문서(Swagger)에서 제외합니다.
@Controller
public class SpaController {

    private final String publicUrl;

    public SpaController(@Value("${app.public-url:http://localhost:5173}") String publicUrl) {
        this.publicUrl = normalizePublicUrl(publicUrl);
    }

    @GetMapping("/oauth2/login-page")
    public String oauth2LoginPage() {
        return "redirect:" + publicUrl + "/login";
    }

    // React Router에서 사용하는 경로만 명시적으로 포워딩합니다.
    // 와일드카드를 쓰면 /ws-native 등 WebSocket 경로도 가로채는 문제가 생깁니다.
    @GetMapping(value = {
            "/login",
            "/main",
            "/settings",
            "/settings/**",
            "/teams",
            "/notification-rules",
            "/invite/**",
            "/dashboard/**",
            "/oauth2/redirect"
    })
    public String spa() {
        return "forward:/index.html";
    }

    private String normalizePublicUrl(String value) {
        if (value == null || value.isBlank()) {
            return "http://localhost:5173";
        }
        return value.replaceAll("/+$", "");
    }
}
