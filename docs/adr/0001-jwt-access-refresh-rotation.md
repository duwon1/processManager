# ADR-0001: Access Token(JWT) + Refresh Token 회전, HttpOnly 쿠키 저장

- **상태**: 채택
- **관련 코드**: `JwtTokenProvider`, `RefreshTokenService`, `RefreshTokenCookieWriter`, `AuthController`, `OAuth2SuccessHandler`, 프론트 `useAuthFetch.js`

## 맥락

SPA(React)와 REST 백엔드를 분리 운영하며, Google OAuth2 로그인을 사용한다.
브라우저에 토큰을 어떻게 보관할지 결정해야 했다. 고려한 위협:

- **XSS**: `localStorage`에 토큰을 두면 스크립트 injection 시 탈취된다.
- **CSRF**: 쿠키 기반 인증은 교차 사이트 요청 위조에 노출될 수 있다.
- **토큰 수명**: 길면 탈취 시 피해가 크고, 짧으면 잦은 재로그인으로 UX가 나빠진다.

## 결정

두 종류의 토큰으로 역할을 분리한다.

- **Access Token (JWT, 30분)**: 무상태 검증. 메모리(React Context)에만 보관하고
  `Authorization: Bearer`로 전송한다. `localStorage`에 저장하지 않는다.
- **Refresh Token (7일)**: **HttpOnly 쿠키**(`refresh_token`)에 원문을 담고,
  DB에는 `SHA-256(salt + rawToken)` 해시만 저장한다.

추가 규칙:

1. **회전(Rotation)**: `/api/auth/refresh` 호출마다 Refresh Token을 새로 발급하고 기존 것을 폐기한다.
2. **Grace Period(10초)**: 빠른 새로고침으로 동시에 refresh가 겹치는 경쟁 상태를 위해,
   교체 직후 10초 동안은 직전 토큰도 허용한다.
3. **재사용 감지**: 현재·직전 토큰 모두 불일치하면 탈취 시도로 간주하고 저장소에서 즉시 폐기한다.
4. **프론트 단일화**: 여러 요청이 동시에 401을 받아도 refresh는 앱 전체에서 1번만 실행한다(`useAuthFetch.js`).
5. Access Token은 OAuth2 리다이렉트 시 URL **fragment**(`#accessToken=`)로 전달해 서버 로그·Referer 노출을 줄인다.

## 결과

**장점**
- Access Token이 메모리에만 있어 XSS 탈취 창을 최소화한다.
- Refresh Token은 HttpOnly라 JS에서 접근 불가, DB에는 해시만 있어 유출 시에도 원문이 안전하다.
- 회전 + 재사용 감지로 탈취된 토큰의 수명을 크게 줄인다.

**단점 / 비용**
- 페이지 새로고침 시 Access Token이 사라져 refresh 왕복이 1회 필요하다.
- 회전 방식은 동시 요청 경쟁 상태를 유발하므로 Grace Period와 프론트 단일화 로직이 필요하다.
- CSRF 방어는 CORS(`allowCredentials` + 허용 출처 화이트리스트)와 refresh 엔드포인트 한정으로 처리한다.
