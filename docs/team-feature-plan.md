# Team Feature Plan

## 목표

사용자가 본인이 등록한 노드를 다른 사용자와 공유할 수 있는 팀 기능을 만든다.

팀에 연결된 사용자는 팀에 배정된 노드에 대해 노드 소유자와 동일한 수준으로 정보를 보고 조작할 수 있다. 즉, 모니터링, 작업 관리자, 서비스 제어, 터미널, 업데이트, 삭제 같은 노드 단위 기능은 권한이 허용된 팀원에게도 동일하게 열리는 구조를 목표로 한다.

## 핵심 요구사항

- 사용자는 팀을 만들 수 있다.
- 사용자는 팀별로 공유할 노드를 직접 선택할 수 있다.
- 팀원은 팀에 배정된 노드 목록만 볼 수 있다.
- 팀원은 배정된 노드에서 소유자가 볼 수 있는 정보를 동일하게 볼 수 있다.
- 팀원은 배정된 노드에서 소유자가 실행할 수 있는 작업을 동일하게 실행할 수 있다.
- 팀에 배정되지 않은 노드는 팀원에게 보이면 안 된다.
- 노드 소유자는 본인이 등록한 노드에 대한 최종 소유권을 가진다.

## 확정된 팀 등록 방식

팀원 등록은 `정확한 이메일 입력 초대 + 상대방 수락` 방식으로 간다.

관리자는 팀 관리 화면에서 초대할 사용자의 이메일을 정확히 입력한다. 서버는 해당 이메일로 이미 가입된 사용자가 있는지 확인하고, 가입된 사용자라면 `INVITED` 상태의 팀 멤버 초대를 만든다. 초대받은 사용자는 본인 계정으로 로그인한 뒤 초대를 수락해야 `ACTIVE` 팀원이 된다.

기본 흐름:

```text
1. 팀 관리자가 초대할 이메일을 정확히 입력
2. 서버가 가입된 사용자 여부 확인
3. 가입된 사용자면 team_members에 INVITED 생성
4. 초대받은 사용자가 로그인
5. 초대 목록에서 수락
6. team_members.status = ACTIVE
7. 팀에 공유된 노드 접근 가능
```

이 방식에서는 초대 코드, 팀 코드, 부분 이메일 검색을 사용하지 않는다.

### 이메일 검색 정책

가입 유저 목록을 부분 검색으로 보여주지 않는다. 이메일 목록이 노출되면 개인정보 수집에 악용될 수 있기 때문이다.

금지:

```text
test 입력 → test1@gmail.com, test2@gmail.com 목록 표시
gmail.com 입력 → 가입자 이메일 목록 표시
```

허용:

```text
정확한 이메일 입력 → 초대 요청 처리
```

### 초대 응답 정책

브루트포스와 계정 열거를 줄이기 위해 외부 응답 메시지는 가능하면 통일한다.

```text
초대 요청을 처리했습니다.
```

내부 처리:

```text
가입된 이메일이면 → INVITED 생성
가입 안 된 이메일이면 → 초대 생성 안 함
이미 팀원이면 → 중복 생성 안 함
이미 초대 대기 중이면 → 중복 생성 안 함
```

초기 개발 단계에서는 사용자 편의상 "가입된 사용자가 아닙니다"를 보여줄 수 있지만, 공개 서비스로 운영할 때는 응답을 통일하는 쪽이 안전하다.

### 방어 정책

- 자기 자신 초대 금지
- 이미 팀원인 사용자 초대 금지
- 같은 팀에 같은 사용자 중복 초대 금지
- 사용자당 초대 요청 횟수 제한
- 팀당 초대 요청 횟수 제한
- IP당 초대 요청 횟수 제한
- 초대 요청, 수락, 거절, 취소를 감사 로그에 기록

권장 제한 예시:

```text
사용자당 분당 5회
팀당 시간당 20회
IP당 시간당 50회
```

## 권한 모델

초기 버전은 복잡한 역할 권한보다 명확한 `FULL_ACCESS` 모델로 간다.

### 권한 원칙

- 노드 소유자는 항상 해당 노드에 접근할 수 있다.
- 팀원은 자신이 속한 팀에 배정된 노드에 접근할 수 있다.
- 팀에 배정된 노드에 대해 팀원은 소유자와 같은 작업 권한을 가진다.
- API는 항상 현재 로그인 사용자가 접근 가능한 노드인지 검사해야 한다.
- 프론트에서 숨기는 것만으로는 보안이 되지 않으므로 백엔드에서 반드시 권한을 막아야 한다.

### 주의해야 할 작업

팀원이 소유자와 동일하게 할 수 있는 작업에는 위험한 작업도 포함된다.

- 노드 삭제 요청
- 서비스 시작/중지/재시작
- 프로세스 종료
- 터미널 명령 실행
- 에이전트 업데이트 요청

이 기능들을 정말 팀원에게 모두 허용할지 최종 확인이 필요하다. 허용한다면 감사 로그가 필요하다.

## DB 구성 원칙

데이터베이스는 여러 개 만들 필요가 없다. 현재 사용하는 `processmanager` DB 하나에 팀/로그용 테이블을 추가한다.

```text
DB: processmanager

기존 테이블:
- users
- refresh_tokens
- nodes

추가할 테이블:
- teams
- team_members
- team_nodes
- audit_logs
```

즉, 데이터베이스는 1개이고 테이블만 추가한다.

## 로그 설계 원칙

로그는 크게 두 종류로 나눠서 생각한다.

### 시스템 로그

Spring Boot, Fly.io, GitHub Actions, 브라우저, 에이전트 실행 환경에서 자동으로 남는 기술 로그다.

예시:

- 서버 시작/종료
- DB 연결 실패
- API 처리 중 예외
- WebSocket 연결 오류
- 배포 실패
- 프론트 빌드 실패

이 로그는 보통 DB에 저장하지 않고 Fly.io logs, GitHub Actions logs, IntelliJ 실행 콘솔, 브라우저 DevTools, 에이전트 PC의 `journalctl` 같은 곳에서 본다.

### 감사 로그

사용자가 시스템 안에서 한 중요한 행동을 직접 DB에 저장하는 로그다.

예시:

- 팀 생성/삭제
- 팀원 초대/제거
- 팀에 노드 공유/해제
- 노드 삭제 요청
- 서비스 시작/중지/재시작
- 프로세스 종료
- 터미널 명령 실행
- 에이전트 업데이트 요청
- 토큰 재발급
- 권한 없는 접근 시도

이 로그는 자동으로 남지 않는다. 백엔드 코드에서 중요한 API가 실행될 때 `audit_logs` 테이블에 직접 저장해야 한다.

## API별 로그 기준

모든 API 호출을 감사 로그로 저장하면 안 된다. 이 프로젝트는 모니터링/작업 관리자 화면에서 조회 API와 polling이 자주 발생하므로, 모든 API를 DB에 저장하면 로그가 너무 많이 쌓인다.

기본 기준은 아래와 같다.

```text
POST / PUT / PATCH / DELETE
→ 감사 로그 후보

GET
→ 기본적으로 생략하거나 접근 로그로만 처리
→ 단, 민감 정보 조회나 권한 거부는 감사 로그로 저장 가능
```

### 감사 로그로 저장할 API

- 팀 생성/수정/삭제
- 팀원 초대/수락/제거
- 팀별 공유 노드 추가/제거
- 노드 삭제 요청
- 서비스 시작/중지/재시작
- 프로세스 종료
- 터미널 명령 실행
- 에이전트 업데이트 요청
- 계정 토큰 재발급
- 권한 없는 접근 시도

### DB 감사 로그에 매번 저장하지 않을 API

- `GET /api/node/list`
- 모니터링 조회
- 프로세스 목록 조회
- 서비스 목록 조회
- 팀 목록 조회
- WebSocket heartbeat
- 자동 새로고침 polling

이런 조회성 API는 장애 분석용 시스템 로그 또는 서버 access log로 충분한 경우가 많다. DB 감사 로그에는 실패, 권한 거부, 민감 조회 정도만 남긴다.

## 로그 조회 권한

`audit_logs` 테이블은 하나만 둔다. 노드 소유자용 로그 테이블, 팀 관리자용 로그 테이블을 따로 만들지 않는다.

대신 로그를 조회할 때 현재 로그인 사용자의 권한에 맞게 필터링한다.

```text
서비스 운영자
→ 전체 로그 조회 가능

노드 소유자
→ 본인이 소유한 노드에서 발생한 로그 조회 가능

팀 관리자
→ 본인이 OWNER/ADMIN인 팀에서 발생한 로그 조회 가능

일반 팀원
→ 본인이 실행한 로그 조회 가능
→ 팀 정책에 따라 팀 로그 일부 조회 가능
```

예시 쿼리:

```sql
-- 노드 소유자가 보는 내 노드 로그
SELECT l.*
FROM audit_logs l
JOIN nodes n ON n.id = l.node_id
WHERE n.user_id = :currentUserId
ORDER BY l.created_at DESC;
```

```sql
-- 팀 관리자가 보는 팀 로그
SELECT l.*
FROM audit_logs l
JOIN team_members tm ON tm.team_id = l.team_id
WHERE tm.user_id = :currentUserId
  AND tm.role IN ('OWNER', 'ADMIN')
ORDER BY l.created_at DESC;
```

```sql
-- 일반 사용자가 보는 내 활동 기록
SELECT l.*
FROM audit_logs l
WHERE l.actor_user_id = :currentUserId
ORDER BY l.created_at DESC;
```

핵심은 로그 저장 시 `actor_user_id`, `team_id`, `node_id`를 충분히 저장하고, 로그 조회 API에서 권한별 `WHERE` 조건을 적용하는 것이다.

## 로그 보존 원칙

감사 로그는 과거 판단 근거이므로 일반 데이터처럼 쉽게 삭제되면 안 된다.

- 팀이 삭제되어도 과거 팀 작업 기록은 남아야 한다.
- 노드가 삭제되어도 과거 노드 작업 기록은 남아야 한다.
- 사용자가 탈퇴해도 과거 작업 기록은 최소한 이메일 스냅샷으로 추적 가능해야 한다.
- 감사 로그는 사용자가 임의로 수정/삭제할 수 없어야 한다.

따라서 로그 테이블에는 참조 ID뿐 아니라 당시 이름/이메일 스냅샷도 같이 저장한다.

예시:

```text
actor_user_id
actor_email
team_id
team_name
node_id
node_name
```

`audit_logs`에는 `ON DELETE CASCADE`를 강하게 걸지 않는 편이 좋다. FK를 걸더라도 `ON DELETE SET NULL`을 고려하거나, 로그 보존을 우선해 스냅샷 컬럼 중심으로 조회한다.

## 데이터베이스 설계안

### teams

팀 기본 정보.

```sql
CREATE TABLE teams (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_owner_team_name (owner_user_id, name),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### team_members

팀에 속한 사용자 정보.

```sql
CREATE TABLE team_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
    status VARCHAR(30) NOT NULL DEFAULT 'INVITED',
    invited_by_user_id BIGINT NULL,
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    rejected_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_user (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

팀 생성자는 `role = 'OWNER'`, `status = 'ACTIVE'`로 `team_members`에 같이 저장한다. 이후 초대받은 사용자는 `role = 'MEMBER'`, `status = 'INVITED'`로 생성하고, 본인이 수락하면 `ACTIVE`로 변경한다.

### team_nodes

팀에 어떤 노드를 보여줄지 설정하는 연결 테이블.

```sql
CREATE TABLE team_nodes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    team_id BIGINT NOT NULL,
    node_id BIGINT NOT NULL,
    access_level VARCHAR(30) NOT NULL DEFAULT 'FULL_ACCESS',
    granted_by_user_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_node (team_id, node_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### audit_logs

팀원이 노드에 대해 강한 작업을 실행할 수 있으므로 감사 로그를 남기는 것이 좋다.

로그 테이블은 하나만 두고, 누가 볼 수 있는지는 조회 API에서 권한으로 구분한다. 또한 팀/노드/사용자가 나중에 삭제되어도 과거 기록을 판단할 수 있도록 당시 이메일, 팀 이름, 노드 이름을 스냅샷으로 같이 저장한다.

```sql
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT NULL,
    actor_email VARCHAR(255) NULL,
    team_id BIGINT NULL,
    team_name VARCHAR(100) NULL,
    node_id BIGINT NULL,
    node_name VARCHAR(255) NULL,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(255) NULL,
    result VARCHAR(30) NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    detail TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

인덱스는 조회 패턴 기준으로 추가한다.

```sql
CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, created_at);
CREATE INDEX idx_audit_node ON audit_logs (node_id, created_at);
CREATE INDEX idx_audit_team ON audit_logs (team_id, created_at);
CREATE INDEX idx_audit_action ON audit_logs (action, created_at);
```

## 백엔드 API 설계안

### 팀 관리

- `GET /api/team/list`
  - 내가 만든 팀과 내가 속한 팀 목록 조회
- `POST /api/team`
  - 팀 생성
- `PATCH /api/team/{teamId}`
  - 팀 이름/설명 수정
- `DELETE /api/team/{teamId}`
  - 팀 삭제

### 팀원 관리

- `GET /api/team/{teamId}/members`
  - 팀원 목록 조회
- `POST /api/team/{teamId}/members/invite`
  - 정확한 이메일로 가입 유저 초대
- `GET /api/team/invitations`
  - 내가 받은 초대 목록 조회
- `POST /api/team/invitations/{memberId}/accept`
  - 초대 수락
- `POST /api/team/invitations/{memberId}/reject`
  - 초대 거절
- `DELETE /api/team/{teamId}/members/{memberId}`
  - 팀원 제거 또는 초대 취소

### 팀별 노드 설정

- `GET /api/team/{teamId}/nodes`
  - 팀에 배정된 노드 목록 조회
- `PUT /api/team/{teamId}/nodes`
  - 팀에 보여줄 노드 목록 전체 저장
- `POST /api/team/{teamId}/nodes/{nodeId}`
  - 팀에 노드 추가
- `DELETE /api/team/{teamId}/nodes/{nodeId}`
  - 팀에서 노드 제거

### 감사 로그 조회

- `GET /api/audit/my-actions`
  - 내가 실행한 작업 기록 조회
- `GET /api/audit/nodes/{nodeId}`
  - 내가 소유하거나 접근 권한이 있는 노드의 작업 기록 조회
- `GET /api/audit/teams/{teamId}`
  - 내가 관리자이거나 정책상 조회 가능한 팀의 작업 기록 조회
- `GET /api/admin/audit`
  - 서비스 운영자 전용 전체 감사 로그 조회

### 노드 권한 검사 공통화

기존 노드 API는 단순히 `nodes.user_id = currentUser.id`만 보면 안 된다.

앞으로는 아래 조건 중 하나를 만족해야 접근 가능하다.

- 현재 사용자가 노드 소유자다.
- 현재 사용자가 속한 팀에 해당 노드가 배정되어 있다.

이를 위해 `NodeAccessService` 같은 공통 권한 서비스를 만든다.

```java
boolean canAccessNode(Long userId, Long nodeId);
boolean canControlNode(Long userId, Long nodeId);
List<Node> findAccessibleNodes(Long userId);
```

모니터링, 작업 관리자, 서비스 제어, 터미널, 삭제, 업데이트 API는 모두 이 권한 서비스를 거쳐야 한다.

## 프론트엔드 화면 설계안

### 사이드바

- 노드 목록은 내가 소유한 노드와 팀을 통해 접근 가능한 노드를 함께 보여준다.
- 노드 카드 또는 목록 항목에 `내 노드`, `팀 노드` 배지를 표시한다.
- 팀 목록도 사이드바에 표시한다.

### 팀 관리 화면

- 팀 생성
- 팀 이름/설명 수정
- 팀 삭제
- 정확한 이메일 입력으로 팀원 초대
- 받은 초대 수락/거절
- 팀원 제거 또는 초대 취소
- 팀별 공유 노드 체크박스 설정

### 팀 상세 화면

- 팀 정보
- 팀원 목록
- 팀에 공유된 노드 목록
- 공유 노드 추가/제거

### 노드 화면

- 팀을 통해 접근한 노드도 기존 대시보드, 모니터링, 작업 관리자 화면을 그대로 사용한다.
- 백엔드 권한만 통과하면 화면 로직은 최대한 재사용한다.

## 구현 순서

1. DB 테이블 추가
   - `teams`
   - `team_members`
   - `team_nodes`
   - 필요 시 `audit_logs`

2. 공통 노드 권한 서비스 추가
   - 소유자 접근
   - 팀원 접근
   - 접근 가능한 노드 목록 조회

3. 기존 노드 API 권한 로직 수정
   - `/api/node/list`
   - 대시보드/모니터링 데이터
   - 작업 관리자 데이터
   - 서비스 제어
   - 터미널
   - 삭제/업데이트 요청

4. 팀 API 추가
   - 팀 생성/수정/삭제
   - 팀원 관리
   - 팀별 노드 설정

5. 프론트 팀 화면 추가
   - 팀 목록
   - 팀 생성
   - 팀원 등록
   - 팀별 공유 노드 선택

6. 감사 로그 추가
   - 위험 작업 실행자 기록
   - 어떤 팀 권한으로 실행했는지 기록

7. 테스트
   - 소유자 접근 가능
   - 팀원 접근 가능
   - 팀에 없는 사용자는 접근 불가
   - 팀에 배정되지 않은 노드는 접근 불가
   - 팀원이 위험 작업을 실행할 수 있는지 확인
   - 팀 제거 시 접근 권한 즉시 제거 확인

## 결정 필요 질문

- 팀원이 노드 삭제까지 할 수 있어야 하는가?
- 팀원이 터미널 명령 실행까지 할 수 있어야 하는가?
- 팀원이 다른 팀원을 초대하거나 제거할 수 있어야 하는가?
- 팀원이 팀에 공유된 노드 목록을 바꿀 수 있어야 하는가?
- 팀원이 노드 설치용 계정 토큰까지 볼 수 있어야 하는가?
- 같은 노드를 여러 팀에 공유할 수 있어야 하는가?
- 팀원이 실행한 작업 기록을 화면에서 볼 수 있어야 하는가?

## 현재 추천 방향

초기 구현은 아래 방식이 가장 안전하다.

- 팀 등록 방식: 정확한 이메일 입력 초대 + 상대방 수락
- 팀원 검색 방식: 부분 검색 없음, 정확한 이메일만 입력
- 팀 권한: 팀에 배정된 노드에 대해 `FULL_ACCESS`
- 팀 관리 권한: 팀 생성자만 팀원/공유 노드 수정 가능
- 팀원 권한: 배정된 노드 조회 및 제어 가능
- 감사 로그: 터미널, 프로세스 종료, 서비스 제어, 노드 삭제, 업데이트 요청은 기록
- 로그 조회: `audit_logs` 테이블은 하나만 두고 서비스 운영자, 노드 소유자, 팀 관리자, 일반 팀원별로 조회 API에서 필터링

이렇게 가면 사용자는 원하는 "팀원이 나와 똑같이 볼 수 있고 할 수 있는" 구조를 얻으면서도, 누가 어떤 작업을 했는지 추적할 수 있다.
