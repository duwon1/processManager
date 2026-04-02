-- 사용자 테이블 (Google OAuth2 로그인 정보 저장)
CREATE TABLE IF NOT EXISTS users (
    id         BIGINT       AUTO_INCREMENT PRIMARY KEY, -- 사용자 고유 ID
    email      VARCHAR(255) NOT NULL UNIQUE,            -- 구글 이메일 (로그인 키)
    name       VARCHAR(255),                            -- 구글 계정 이름
    picture    VARCHAR(500),                            -- 구글 프로필 사진 URL
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP, -- 최초 가입일
    updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP -- 정보 수정일
);

-- 노드 테이블 (사용자가 등록한 모니터링 대상 서버)
CREATE TABLE IF NOT EXISTS nodes (
    id         BIGINT       AUTO_INCREMENT PRIMARY KEY, -- 노드 고유 ID
    user_id    BIGINT       NOT NULL,                   -- 어느 사용자의 노드인지 (users.id 참조)
    name       VARCHAR(100) NOT NULL,                   -- 노드 별칭 (예: "웹서버1", "DB서버")
    host       VARCHAR(255) NOT NULL,                   -- 노드 IP 주소 (예: 192.168.0.10)
    port       INT          NOT NULL,                   -- 에이전트 포트 (예: 8081)
    os_type    VARCHAR(50),                             -- 운영체제 (Linux / Windows)
    status     CHAR(1)      DEFAULT 'N',                -- 온라인 여부 (Y: online, N: offline)
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP, -- 노드 등록일
    updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- 노드 정보 수정일
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE -- 사용자 삭제 시 노드도 함께 삭제
);
