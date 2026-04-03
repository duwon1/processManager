package com.example.processmanager.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import jakarta.servlet.http.HttpServletResponse;
import java.util.List;

@Configuration // 이 클래스가 스프링의 환경 설정 파일임을 알려줍니다.
@EnableWebSecurity // 스프링 시큐리티(보안) 기능을 본격적으로 활성화합니다.
public class SecurityConfig {

    // 우리가 직접 만든 소셜 로그인 성공 처리기와 JWT 검문소(필터)를 가져올 준비를 합니다.
    private final OAuth2SuccessHandler oAuth2SuccessHandler;
    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    // CORS 허용 출처 목록 (application.properties에서 주입, 여러 개면 쉼표로 구분)
    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    // 스프링이 알아서 위 두 객체를 가져와서(주입해서) 세팅해 줍니다.
    public SecurityConfig(OAuth2SuccessHandler oAuth2SuccessHandler, JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.oAuth2SuccessHandler = oAuth2SuccessHandler;
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    // 보안의 핵심 규칙을 정의하는 곳입니다. 어떤 요청은 막고, 어떤 요청은 허용할지 정합니다.
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // 1. CSRF 방어 기능 끄기
                // 원래는 보안을 위해 켜두지만, 리액트 같은 프론트엔드와 API 통신을 할 때는
                // 주로 토큰 방식을 쓰기 때문에 이 기능을 꺼두는 것이 일반적입니다.
                .csrf(csrf -> csrf.disable())

                // 2. CORS (교차 출처 리소스 공유) 설정 적용
                // 포트가 다른 리액트(5173)와 스프링(8080)이 데이터를 주고받을 수 있게 허락해 줍니다.
                // 바로 아래에 있는 corsConfigurationSource() 메서드의 규칙을 따릅니다.
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // 3. 세션 관리 방식 변경 (매우 중요★)
                // JWT를 사용하므로 스프링이 기본적으로 서버에 유저 정보를 저장하는 '세션'을 쓰지 않겠다고 선언합니다.
                // 무상태성(STATELESS)으로 설정하여 메모리를 아끼고 토큰으로만 인증합니다.
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // 4. URL별 접근 권한 설정
                .authorizeHttpRequests(auth -> auth
                        // 메인 페이지, 로그인 관련 경로, 구글 로그인 처리 경로 등은 로그인 없이(토큰 없이) 누구나 접근 가능!
                        .requestMatchers("/", "/login", "/oauth2/**", "/ws/**", "/ws-native/**", "/api/auth/**").permitAll()
                        // 그 외의 모든 요청(모니터링 데이터 요청 등)은 무조건 로그인을 해야(토큰이 있어야) 통과시켜 줍니다.
                        .anyRequest().authenticated()
                )

                // 5. 인증 실패 시 OAuth2 로그인으로 리다이렉트 대신 401 반환
                // API 요청은 리다이렉트가 아닌 401 상태코드를 받아야 프론트에서 처리 가능합니다.
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Unauthorized"))
                )

                // 6. OAuth2 (소셜 로그인) 설정
                .oauth2Login(oauth2 -> oauth2
                        // 구글 로그인이 성공적으로 끝나면, 우리가 만든 OAuth2SuccessHandler를 실행해라!
                        // (여기서 JWT 토큰이 만들어지고 리액트로 튕겨 보냅니다)
                        .successHandler(oAuth2SuccessHandler)
                )

                // 7. 커스텀 필터(검문소) 등록
                // 스프링의 기본 로그인 검문소(UsernamePasswordAuthenticationFilter)가 작동하기 전에,
                // 우리가 만든 JWT 검문소(jwtAuthenticationFilter)를 먼저 거치게끔 새치기 시켜줍니다.
                // 여기서 토큰이 유효한지 검사하게 됩니다.
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build(); // 설정한 규칙들을 하나로 묶어서 반환합니다.
    }

    // 리액트(프론트)에서 백엔드로 요청을 보낼 때 막히지 않도록 허락해 주는 세부 설정입니다.
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // 어떤 도메인(출처)의 접근을 허락할 것인가? -> .env의 APP_CORS_ALLOWED_ORIGINS 값 (쉼표 구분)
        configuration.setAllowedOrigins(List.of(allowedOrigins.split(",")));

        // 어떤 HTTP 메서드를 허락할 것인가? (조회, 생성, 수정, 삭제 등)
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));

        // 어떤 헤더값을 허락할 것인가? -> 전부 다(*) 허락
        configuration.setAllowedHeaders(List.of("*"));

        // 인증 정보(쿠키 등)를 같이 주고받는 것을 허락할 것인가? -> Yes (true)
        // 우리가 Refresh Token을 HttpOnly 쿠키에 담아서 보내기 때문에 이 설정이 꼭 필요합니다.
        configuration.setAllowCredentials(true);

        // 모든 경로("/**")에 대해 위에서 정한 CORS 규칙을 적용합니다.
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}