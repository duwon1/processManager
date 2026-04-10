-- 사용자 테이블 (Google OAuth2 로그인 정보 저장)
CREATE TABLE IF NOT EXISTS users (
    id         BIGINT       AUTO_INCREMENT PRIMARY KEY, -- 사용자 고유 ID
    email      VARCHAR(255) NOT NULL UNIQUE,            -- 구글 이메일 (로그인 키)
    name       VARCHAR(255),                            -- 구글 계정 이름
    picture    VARCHAR(500),                            -- 구글 프로필 사진 URL
    account_token VARCHAR(100) NULL,                     -- 에이전트 인증용 계정 토큰 (pm_ 접두사 + 64자 hex = 67자)
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP, -- 최초 가입일
    updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- 정보 수정일
);

-- Refresh Token 테이블 (해시+솔트로 안전하게 저장, 유저당 1개)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    user_email      VARCHAR(255) NOT NULL UNIQUE,              -- 유저당 1개만 허용
    token_hash      VARCHAR(255) NOT NULL,                     -- SHA-256(salt + raw) 해시값 (현재)
    salt            VARCHAR(255) NOT NULL,                     -- 해시에 사용된 랜덤 솔트 (현재)
    prev_token_hash VARCHAR(255) NULL,                         -- 이전 토큰 해시 (Grace Period 용)
    prev_salt       VARCHAR(255) NULL,                         -- 이전 토큰 솔트 (Grace Period 용)
    replaced_at     DATETIME     NULL,                         -- 토큰 교체 시각 (Grace Period 기준점)
    expires_at      DATETIME     NOT NULL,                     -- 만료 일시
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rt_user FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

-- 노드 테이블 (에이전트가 연결 시 자동 등록되는 서버 목록)
CREATE TABLE IF NOT EXISTS nodes (
    id         BIGINT       AUTO_INCREMENT PRIMARY KEY, -- 노드 고유 ID
    user_id    BIGINT       NOT NULL,                   -- 소유자 (users.id 참조)
    name       VARCHAR(100) NOT NULL,                   -- 에이전트 hostname (표시용)
    os_type    VARCHAR(50),                             -- 운영체제 (Linux / Windows)
    status     CHAR(1)      DEFAULT 'N',                -- 연결 상태 (Y: 연결됨, N: 끊김)
    last_seen  TIMESTAMP    NULL,                       -- 마지막 통신 시간
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP, -- 최초 등록일
    agent_id   VARCHAR(36)  NULL,                       -- 에이전트 고유 UUID (재설치 시 동일 노드 식별)
    UNIQUE KEY uk_user_node (user_id, name),            -- 같은 사용자의 동일 hostname = 같은 노드
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- 기존 테이블에 agent_id 컬럼이 없으면 추가합니다.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS agent_id VARCHAR(36) NULL;
