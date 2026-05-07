# 프로젝트 작업 규칙

- 요청 범위 안에서만 작업하고, 모호하거나 위험한 변경은 먼저 확인한다.
- 기존 변경사항은 임의로 되돌리지 않으며, 파일 수정 전후로 핵심만 짧게 보고한다.
- 비밀번호, 토큰, API 키는 채팅/문서/커밋에 남기지 않고 GitHub Secrets 또는 Fly.io Secrets로 처리한다.
- 프론트엔드 UI는 Bootstrap, Bootstrap Icons, Bootswatch Vapor 테마와 기존 스타일을 우선 사용한다.
- 변경 후 가능한 검증을 수행한다: 프론트엔드 `npm run lint`, `npm run build`; 백엔드 Gradle 테스트/빌드.
- 커밋/푸시/배포는 사용자 확인 후에만 진행하며, `master` 푸시는 Fly.io 자동 배포임을 먼저 알린다.
