package com.example.processmanager.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;

import javax.sql.DataSource;
import java.sql.Connection;

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
}
