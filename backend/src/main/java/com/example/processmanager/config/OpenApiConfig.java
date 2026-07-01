package com.example.processmanager.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI(springdoc-openapi) 문서 메타데이터와 인증 스키마를 정의합니다.
 *
 * <p>대부분의 REST API는 {@code Authorization: Bearer <accessToken>} 헤더로 보호되므로,
 * 여기서 bearer(JWT) 보안 스키마를 등록해 Swagger UI 우측 상단의 <b>Authorize</b> 버튼으로
 * 토큰을 넣고 바로 시험 호출할 수 있게 합니다.</p>
 *
 * <p>접근 경로 — Swagger UI: {@code /swagger-ui.html}, OpenAPI 스펙: {@code /v3/api-docs}.
 * 두 경로 모두 {@code /api/**}가 아니므로 SecurityConfig에서 별도 허용 없이 접근됩니다.</p>
 */
@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearerAuth";

    @Bean
    public OpenAPI processManagerOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Process Manager API")
                        .description("""
                                원격 서버를 웹에서 실시간 모니터링·관리하는 애플리케이션의 REST API입니다.
                                실시간(모니터링·터미널·프로세스 제어)은 STOMP over WebSocket으로 동작하며
                                이 문서에는 포함되지 않습니다. WebSocket 명세는 docs/API.md를 참고하세요.

                                인증: Google OAuth2 로그인으로 발급된 Access Token(JWT)을 우측 상단
                                Authorize 버튼에 입력한 뒤 보호된 엔드포인트를 호출하세요.
                                """)
                        .version("v1"))
                // 전역 기본 보안 요구사항. 공개 엔드포인트는 컨트롤러에서 개별 해제할 수 있습니다.
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME))
                .components(new Components().addSecuritySchemes(BEARER_SCHEME,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Access Token(JWT). 예: eyJhbGciOiJIUzI1NiJ9...")));
    }
}
