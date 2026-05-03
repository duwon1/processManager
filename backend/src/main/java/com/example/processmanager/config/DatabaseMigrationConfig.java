package com.example.processmanager.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

@Configuration
public class DatabaseMigrationConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseMigrationConfig.class);

    private final DataSource dataSource;

    public DatabaseMigrationConfig(DataSource dataSource, ObjectProvider<SshTunnelConfig> sshTunnelConfigProvider) {
        this.dataSource = dataSource;
        // 개발처럼 SSH 터널 bean이 존재하면 먼저 초기화하고, 운영/테스트처럼 없으면 직접 DB 연결로 진행합니다.
        sshTunnelConfigProvider.ifAvailable(sshTunnelConfig -> { });
    }

    // 앱 시작 시 DB 컬럼 마이그레이션을 수행합니다.
    // schema.sql의 CREATE TABLE IF NOT EXISTS와 달리, 기존 테이블에 컬럼을 안전하게 추가합니다.
    @PostConstruct
    public void migrate() {
        try (Connection conn = dataSource.getConnection()) {
            // users.account_token 컬럼 추가 또는 크기 확장
            try (var rs = conn.getMetaData().getColumns(null, null, "users", "account_token")) {
                if (!rs.next()) {
                    conn.createStatement().execute(
                            "ALTER TABLE users ADD COLUMN account_token VARCHAR(100) NULL"
                    );
                    log.info("✅ 마이그레이션 완료: users.account_token 컬럼 추가");
                } else {
                    int columnSize = rs.getInt("COLUMN_SIZE");
                    if (columnSize < 100) {
                        conn.createStatement().execute(
                                "ALTER TABLE users MODIFY COLUMN account_token VARCHAR(100) NULL"
                        );
                        log.info("✅ 마이그레이션 완료: users.account_token 컬럼 크기 확장 ({} → 100)", columnSize);
                    }
                }
            }
            // nodes 테이블 last_seen 컬럼 추가 (없는 경우)
            try (var lastSeenRs = conn.getMetaData().getColumns(null, null, "nodes", "last_seen")) {
                if (!lastSeenRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN last_seen TIMESTAMP NULL");
                    log.info("✅ 마이그레이션: nodes.last_seen 컬럼 추가");
                }
            }
            // 등록 후 재접속은 account_token이 아니라 노드별 agent_secret 해시로 인증합니다.
            try (var secretRs = conn.getMetaData().getColumns(null, null, "nodes", "agent_secret_hash")) {
                if (!secretRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN agent_secret_hash VARCHAR(64) NULL");
                    log.info("✅ 마이그레이션: nodes.agent_secret_hash 컬럼 추가");
                }
            }
            try (var issuedRs = conn.getMetaData().getColumns(null, null, "nodes", "agent_secret_issued_at")) {
                if (!issuedRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN agent_secret_issued_at TIMESTAMP NULL");
                    log.info("✅ 마이그레이션: nodes.agent_secret_issued_at 컬럼 추가");
                }
            }
            // 업데이트 알림/ACK 상태는 배포 재시작에도 유지되도록 nodes 테이블에 저장합니다.
            try (var updateStatusRs = conn.getMetaData().getColumns(null, null, "nodes", "update_status")) {
                if (!updateStatusRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN update_status VARCHAR(20) DEFAULT 'NONE'");
                    log.info("✅ 마이그레이션: nodes.update_status 컬럼 추가");
                }
            }
            try (var updateCurrentRs = conn.getMetaData().getColumns(null, null, "nodes", "update_current_sha")) {
                if (!updateCurrentRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN update_current_sha VARCHAR(40) NULL");
                    log.info("✅ 마이그레이션: nodes.update_current_sha 컬럼 추가");
                }
            }
            try (var updateLatestRs = conn.getMetaData().getColumns(null, null, "nodes", "update_latest_sha")) {
                if (!updateLatestRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN update_latest_sha VARCHAR(40) NULL");
                    log.info("✅ 마이그레이션: nodes.update_latest_sha 컬럼 추가");
                }
            }
            try (var updateMessageRs = conn.getMetaData().getColumns(null, null, "nodes", "update_message")) {
                if (!updateMessageRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN update_message VARCHAR(500) NULL");
                    log.info("✅ 마이그레이션: nodes.update_message 컬럼 추가");
                }
            }
            try (var updateCheckedRs = conn.getMetaData().getColumns(null, null, "nodes", "update_checked_at")) {
                if (!updateCheckedRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN update_checked_at TIMESTAMP NULL");
                    log.info("✅ 마이그레이션: nodes.update_checked_at 컬럼 추가");
                }
            }
            // nodes 테이블 컬럼 마이그레이션 (secret_key, port 제거)
            try (var colRs = conn.getMetaData().getColumns(null, null, "nodes", "secret_key")) {
                if (colRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes DROP COLUMN secret_key");
                    log.info("✅ 마이그레이션: nodes.secret_key 컬럼 제거");
                }
            }
            try (var portRs = conn.getMetaData().getColumns(null, null, "nodes", "port")) {
                if (portRs.next()) {
                    conn.createStatement().execute("ALTER TABLE nodes DROP COLUMN port");
                    log.info("✅ 마이그레이션: nodes.port 컬럼 제거");
                }
            }
            // 운영/개발 모두 실제 에이전트 연결로만 노드가 등록되도록 테스트 더미 노드 자동 삽입은 수행하지 않습니다.
            // deleted_nodes 테이블 생성 (없는 경우)
            try (var tableRs = conn.getMetaData().getTables(null, null, "deleted_nodes", null)) {
                if (!tableRs.next()) {
                    conn.createStatement().execute(
                            "CREATE TABLE deleted_nodes (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "user_id BIGINT NOT NULL, " +
                            "hostname VARCHAR(255) NOT NULL, " +
                            "deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "INDEX idx_user_hostname (user_id, hostname))"
                    );
                    log.info("✅ 마이그레이션 완료: deleted_nodes 테이블 생성");
                }
            }
            // 실제 삭제 대기 노드가 없는 오래된 예약을 제거해 신규 에이전트 등록이 막히지 않게 합니다.
            try (var teamTableRs = conn.getMetaData().getTables(null, null, "teams", null)) {
                if (!teamTableRs.next()) {
                    conn.createStatement().execute(
                            "CREATE TABLE teams (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "owner_user_id BIGINT NOT NULL, " +
                            "name VARCHAR(100) NOT NULL, " +
                            "description VARCHAR(255) NULL, " +
                            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
                            "UNIQUE KEY uk_owner_team_name (owner_user_id, name), " +
                            "FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE)"
                    );
                    log.info("migration complete: teams table created");
                }
            }
            try (var ownerColRs = conn.getMetaData().getColumns(null, null, "teams", "owner_user_id")) {
                if (!ownerColRs.next()) {
                    conn.createStatement().execute("ALTER TABLE teams ADD COLUMN owner_user_id BIGINT NULL");
                    log.info("migration complete: teams.owner_user_id column added");
                }
            }
            try (var legacyUserColRs = conn.getMetaData().getColumns(null, null, "teams", "user_id")) {
                if (legacyUserColRs.next()) {
                    conn.createStatement().execute(
                            "UPDATE teams SET owner_user_id = user_id WHERE owner_user_id IS NULL AND user_id IS NOT NULL"
                    );
                    // 과거 스키마의 user_id NOT NULL 제약이 남아 있으면 새 owner_user_id insert가 실패합니다.
                    conn.createStatement().execute("ALTER TABLE teams MODIFY COLUMN user_id BIGINT NULL");
                    log.info("migration complete: legacy teams.user_id column relaxed");
                }
            }
            // 기존 운영 DB에 과거 팀 테이블이 남아 있으면 CREATE TABLE IF NOT EXISTS만으로는 새 컬럼이 추가되지 않습니다.
            addColumnIfMissing(conn, "teams", "description", "description VARCHAR(255) NULL");
            addColumnIfMissing(conn, "teams", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            addColumnIfMissing(conn, "teams", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            try (var teamMemberTableRs = conn.getMetaData().getTables(null, null, "team_members", null)) {
                if (!teamMemberTableRs.next()) {
                    conn.createStatement().execute(
                            "CREATE TABLE team_members (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "team_id BIGINT NOT NULL, " +
                            "user_id BIGINT NOT NULL, " +
                            "role VARCHAR(30) NOT NULL DEFAULT 'MEMBER', " +
                            "status VARCHAR(30) NOT NULL DEFAULT 'INVITED', " +
                            "invited_by_user_id BIGINT NULL, " +
                            "invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "accepted_at TIMESTAMP NULL, " +
                            "rejected_at TIMESTAMP NULL, " +
                            "cancelled_at TIMESTAMP NULL, " +
                            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
                            "UNIQUE KEY uk_team_user (team_id, user_id), " +
                            "FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, " +
                            "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, " +
                            "FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL)"
                    );
                    log.info("migration complete: team_members table created");
                }
            }
            addColumnIfMissing(conn, "team_members", "role", "role VARCHAR(30) NOT NULL DEFAULT 'MEMBER'");
            addColumnIfMissing(conn, "team_members", "status", "status VARCHAR(30) NOT NULL DEFAULT 'INVITED'");
            addColumnIfMissing(conn, "team_members", "invited_by_user_id", "invited_by_user_id BIGINT NULL");
            addColumnIfMissing(conn, "team_members", "invited_at", "invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            addColumnIfMissing(conn, "team_members", "accepted_at", "accepted_at TIMESTAMP NULL");
            addColumnIfMissing(conn, "team_members", "rejected_at", "rejected_at TIMESTAMP NULL");
            addColumnIfMissing(conn, "team_members", "cancelled_at", "cancelled_at TIMESTAMP NULL");
            addColumnIfMissing(conn, "team_members", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            addColumnIfMissing(conn, "team_members", "updated_at", "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            conn.createStatement().execute(
                    "INSERT IGNORE INTO team_members (team_id, user_id, role, status, accepted_at) " +
                    "SELECT id, owner_user_id, 'OWNER', 'ACTIVE', NOW() " +
                    "FROM teams WHERE owner_user_id IS NOT NULL"
            );
            try (var teamNodeTableRs = conn.getMetaData().getTables(null, null, "team_nodes", null)) {
                if (!teamNodeTableRs.next()) {
                    conn.createStatement().execute(
                            "CREATE TABLE team_nodes (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "team_id BIGINT NOT NULL, " +
                            "node_id BIGINT NOT NULL, " +
                            "access_level VARCHAR(30) NOT NULL DEFAULT 'FULL_ACCESS', " +
                            "granted_by_user_id BIGINT NOT NULL, " +
                            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "UNIQUE KEY uk_team_node (team_id, node_id), " +
                            "FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE, " +
                            "FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE, " +
                            "FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE)"
                    );
                    log.info("migration complete: team_nodes table created");
                }
            }
            addColumnIfMissing(conn, "team_nodes", "access_level", "access_level VARCHAR(30) NOT NULL DEFAULT 'FULL_ACCESS'");
            addColumnIfMissing(conn, "team_nodes", "granted_by_user_id", "granted_by_user_id BIGINT NULL");
            addColumnIfMissing(conn, "team_nodes", "created_at", "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            try (var auditTableRs = conn.getMetaData().getTables(null, null, "audit_logs", null)) {
                if (!auditTableRs.next()) {
                    conn.createStatement().execute(
                            "CREATE TABLE audit_logs (" +
                            "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
                            "actor_user_id BIGINT NULL, " +
                            "actor_email VARCHAR(255) NULL, " +
                            "team_id BIGINT NULL, " +
                            "team_name VARCHAR(100) NULL, " +
                            "node_id BIGINT NULL, " +
                            "node_name VARCHAR(255) NULL, " +
                            "action VARCHAR(100) NOT NULL, " +
                            "target VARCHAR(255) NULL, " +
                            "result VARCHAR(30) NOT NULL, " +
                            "ip_address VARCHAR(45) NULL, " +
                            "user_agent VARCHAR(255) NULL, " +
                            "detail TEXT NULL, " +
                            "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
                            "INDEX idx_audit_actor (actor_user_id, created_at), " +
                            "INDEX idx_audit_node (node_id, created_at), " +
                            "INDEX idx_audit_team (team_id, created_at), " +
                            "INDEX idx_audit_action (action, created_at))"
                    );
                    log.info("migration complete: audit_logs table created");
                }
            }

            int staleDeleteReservations = conn.createStatement().executeUpdate(
                    "DELETE dn " +
                    "FROM deleted_nodes dn " +
                    "LEFT JOIN nodes n " +
                    "  ON n.user_id = dn.user_id " +
                    " AND n.name = dn.hostname " +
                    " AND n.status = 'D' " +
                    "WHERE n.id IS NULL " +
                    "  AND dn.deleted_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)"
            );
            if (staleDeleteReservations > 0) {
                log.info("✅ 마이그레이션 완료: 오래된 삭제 예약 {}건 정리", staleDeleteReservations);
            }
        } catch (Exception e) {
            log.error("마이그레이션 실패: {}", e.getMessage(), e);
        }
    }

    private void addColumnIfMissing(Connection conn, String tableName, String columnName, String columnDefinition)
            throws SQLException {
        try (var columnRs = conn.getMetaData().getColumns(null, null, tableName, columnName)) {
            if (!columnRs.next()) {
                conn.createStatement().execute("ALTER TABLE " + tableName + " ADD COLUMN " + columnDefinition);
                log.info("migration complete: {}.{} column added", tableName, columnName);
            }
        }
    }
}
