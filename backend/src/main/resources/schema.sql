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
    status     CHAR(1)      DEFAULT 'N',                -- 연결 상태 (Y: 연결됨, N: 끊김, D: 삭제 대기)
    last_seen  TIMESTAMP    NULL,                       -- 마지막 통신 시간
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP, -- 최초 등록일
    agent_id   VARCHAR(36)  NULL,                       -- 에이전트 고유 UUID (재설치 시 동일 노드 식별)
    agent_secret_hash VARCHAR(64) NULL,                 -- 노드 전용 secret의 SHA-256 해시
    agent_secret_issued_at TIMESTAMP NULL,              -- 노드 secret 발급/회전 시각
    update_status VARCHAR(20) DEFAULT 'NONE',           -- 에이전트 업데이트 상태 (NONE/PENDING/UPDATING/FAILED)
    update_current_sha VARCHAR(40) NULL,                -- 에이전트가 보고한 현재 Git 커밋
    update_latest_sha VARCHAR(40) NULL,                 -- GitHub 원격 저장소의 최신 커밋
    update_message VARCHAR(500) NULL,                   -- 업데이트 진행/실패 메시지
    update_checked_at TIMESTAMP NULL,                   -- 업데이트 상태 마지막 갱신 시각
    UNIQUE KEY uk_user_node (user_id, name),            -- 같은 사용자의 동일 hostname = 같은 노드
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
    id            BIGINT       AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT       NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   VARCHAR(255) NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_owner_team_name (owner_user_id, name),
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_members (
    id                 BIGINT      AUTO_INCREMENT PRIMARY KEY,
    team_id            BIGINT      NOT NULL,
    user_id            BIGINT      NOT NULL,
    role               VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
    status             VARCHAR(30) NOT NULL DEFAULT 'INVITED',
    can_view_monitoring TINYINT(1) NOT NULL DEFAULT 1,
    can_view_files      TINYINT(1) NOT NULL DEFAULT 0,
    can_use_terminal    TINYINT(1) NOT NULL DEFAULT 0,
    can_control_processes TINYINT(1) NOT NULL DEFAULT 0,
    can_control_services  TINYINT(1) NOT NULL DEFAULT 0,
    invited_by_user_id BIGINT      NULL,
    invited_at         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    accepted_at        TIMESTAMP   NULL,
    rejected_at        TIMESTAMP   NULL,
    cancelled_at       TIMESTAMP   NULL,
    created_at         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_user (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS team_nodes (
    id                 BIGINT      AUTO_INCREMENT PRIMARY KEY,
    team_id            BIGINT      NOT NULL,
    node_id            BIGINT      NOT NULL,
    access_level       VARCHAR(30) NOT NULL DEFAULT 'FULL_ACCESS',
    granted_by_user_id BIGINT      NOT NULL,
    created_at         TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_team_node (team_id, node_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGINT       AUTO_INCREMENT PRIMARY KEY,
    actor_user_id BIGINT       NULL,
    actor_email   VARCHAR(255) NULL,
    team_id       BIGINT       NULL,
    team_name     VARCHAR(100) NULL,
    node_id       BIGINT       NULL,
    node_name     VARCHAR(255) NULL,
    action        VARCHAR(100) NOT NULL,
    target        VARCHAR(255) NULL,
    result        VARCHAR(30)  NOT NULL,
    ip_address    VARCHAR(45)  NULL,
    user_agent    VARCHAR(255) NULL,
    detail        TEXT         NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_actor (actor_user_id, created_at),
    INDEX idx_audit_node (node_id, created_at),
    INDEX idx_audit_team (team_id, created_at),
    INDEX idx_audit_action (action, created_at)
);
