# Codex Security 보안점검 리포트 - 2026-06-05

## 요약

- 대상: `E:\processManager`
- 커밋 기준: `50cb61cd02a678d58a97159b5a9b6043b3aef3e2`
- 방식: Codex Security 레포 전체 스캔
- 결과: 보고 대상 2건 발견, 현재 코드에서 둘 다 수정 완료
- 심각도: Medium 1건, Low 1건

상세 산출물:

- Markdown: `C:\tmp\codex-security-scans\processManager\50cb61cd02a6_20260605-222317\report.md`
- HTML: `C:\tmp\codex-security-scans\processManager\50cb61cd02a6_20260605-222317\report.html`

## 발견 및 수정 사항

| 심각도 | 항목 | 현재 상태 |
| --- | --- | --- |
| Medium | claim된 설치 토큰이 같은 `agentId`로 재사용되어 agent secret을 회전시킬 수 있음 | 수정 완료 |
| Low | Docker 런타임 이미지가 root 권한으로 실행됨 | 수정 완료 |

## 1. 설치 토큰 재사용으로 agent secret 회전 가능

영향 위치:

- `backend/src/main/java/com/example/processmanager/security/SecurityConfig.java:65`
- `backend/src/main/resources/mapper/AgentInstallTokenMapper.xml`
- `backend/src/main/java/com/example/processmanager/service/AgentInstallTokenService.java`
- `backend/src/main/java/com/example/processmanager/service/AgentRegistrationService.java`
- `backend/src/main/java/com/example/processmanager/service/NodeService.java:128`

문제는 설치 토큰이 claim된 뒤에도 같은 `agentId`에 대해서는 일정 시간 다시 사용될 수 있다는 점이었습니다. 공격자가 설치 토큰과 해당 `agentId`를 함께 확보하면, 네이티브 에이전트 WebSocket 등록 흐름을 다시 타고 기존 노드의 `agent_secret_hash`를 새 값으로 회전시킬 수 있었습니다.

적용한 조치:

- `agent_install_tokens.consumed_at` 컬럼을 추가했습니다.
- active/claimed 토큰 조회, claim, extend, markUsed 쿼리에 `consumed_at IS NULL` 조건을 추가했습니다.
- 네이티브 WebSocket 등록 성공 후 `markConsumed`를 호출해 토큰을 최종 소비 처리합니다.
- 같은 토큰이 다시 들어오면 consumed 상태 때문에 claimed-token fallback에서 제외됩니다.
- 등록 성공 후 consumed 처리 순서를 검증하는 회귀 테스트를 추가했습니다.

## 2. Docker 런타임 이미지가 root로 실행됨

영향 위치:

- `Dockerfile`

최종 Docker 런타임 스테이지가 Java 애플리케이션을 실행하기 전에 non-root 사용자로 전환하지 않았습니다. 이 문제만으로 바로 침해가 발생하는 것은 아니지만, 나중에 RCE나 파일 쓰기 취약점이 생겼을 때 컨테이너 내부 피해 범위를 키울 수 있었습니다.

적용한 조치:

- 최종 Docker 스테이지에 `processmanager` 사용자와 그룹을 생성했습니다.
- `/app` 소유권을 `processmanager:processmanager`로 변경했습니다.
- `ENTRYPOINT` 전에 `USER processmanager`를 추가했습니다.

## 검증 결과

- Backend 테스트: `gradlew test` 통과
- Backend 패키징: `gradlew bootJar` 통과
- Frontend production build: `npm run build` 통과
- Frontend audit: `npm audit --audit-level=moderate` 취약점 0건
- Dockerfile non-root 설정: `USER processmanager` 확인

참고: 이 PC에는 Docker CLI가 없어 실제 `docker build`는 로컬에서 실행하지 못했습니다. Render 배포 빌드로 최종 확인합니다.
