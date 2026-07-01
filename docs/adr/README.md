# 아키텍처 결정 기록 (ADR)

ADR(Architecture Decision Record)은 **"왜 이렇게 만들었는가"** 를 남기는 짧은 문서입니다.
코드는 *결과*만 보여주지만, ADR은 그 선택의 *맥락과 근거, 감수한 트레이드오프*를 기록합니다.

## 목록

| 번호 | 제목 | 상태 |
|------|------|------|
| [0001](0001-jwt-access-refresh-rotation.md) | Access Token(JWT) + Refresh Token 회전, HttpOnly 쿠키 저장 | 채택 |
| [0002](0002-agent-auth-install-token-and-secret.md) | 에이전트 인증: 1회용 설치 토큰 → 노드 전용 secret | 채택 |
| [0003](0003-dual-websocket-endpoints.md) | 브라우저/에이전트 이중 WebSocket 엔드포인트 | 채택 |
| [0004](0004-node-soft-delete-via-ack.md) | 노드 소프트 삭제: 언인스톨 ACK 기반 최종 삭제 | 채택 |

## 작성 형식

각 ADR은 다음 구조를 따릅니다.

- **상태(Status)**: 제안 / 채택 / 폐기 / 대체됨
- **맥락(Context)**: 어떤 문제·제약이 있었는가
- **결정(Decision)**: 무엇을 선택했는가
- **결과(Consequences)**: 장점과 감수한 단점

## 새 ADR을 언제 쓰나

되돌리기 어렵거나 팀에 영향이 큰 결정을 내렸을 때 씁니다. 예: 인증 방식, 저장소 선택,
통신 프로토콜, 데이터 모델의 핵심 규칙. 사소한 구현 디테일은 코드 주석으로 충분합니다.
