package com.example.processmanager.config;

import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;

import javax.sql.DataSource;
import java.sql.Connection;

@Configuration
@DependsOn("sshTunnelConfig") // SSH 터널 연결 후 실행
public class DatabaseMigrationConfig {

    private final DataSource dataSource;

    public DatabaseMigrationConfig(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    // 앱 시작 시 DB 컬럼 마이그레이션을 수행합니다.
    // schema.sql의 CREATE TABLE IF NOT EXISTS와 달리, 기존 테이블에 컬럼을 안전하게 추가합니다.
    @PostConstruct
    public void migrate() {
        try (Connection conn = dataSource.getConnection()) {
            var rs = conn.getMetaData().getColumns(null, null, "users", "account_token");
            if (!rs.next()) {
                // 컬럼이 없으면 추가합니다.
                conn.createStatement().execute(
                        "ALTER TABLE users ADD COLUMN account_token VARCHAR(100) NULL"
                );
                System.out.println("✅ 마이그레이션 완료: users.account_token 컬럼 추가");
            } else {
                // 컬럼이 이미 있지만 크기가 부족하면 확장합니다. (pm_ 접두사 도입으로 67자 필요)
                int columnSize = rs.getInt("COLUMN_SIZE");
                if (columnSize < 100) {
                    conn.createStatement().execute(
                            "ALTER TABLE users MODIFY COLUMN account_token VARCHAR(100) NULL"
                    );
                    System.out.println("✅ 마이그레이션 완료: users.account_token 컬럼 크기 확장 (" + columnSize + " → 100)");
                }
            }
            // nodes 테이블 last_seen 컬럼 추가 (없는 경우)
            var lastSeenRs = conn.getMetaData().getColumns(null, null, "nodes", "last_seen");
            if (!lastSeenRs.next()) {
                conn.createStatement().execute("ALTER TABLE nodes ADD COLUMN last_seen TIMESTAMP NULL");
                System.out.println("✅ 마이그레이션: nodes.last_seen 컬럼 추가");
            }

            // nodes 테이블 컬럼 마이그레이션 (secret_key, port 제거 / host nullable)
            var colRs = conn.getMetaData().getColumns(null, null, "nodes", "secret_key");
            if (colRs.next()) {
                conn.createStatement().execute("ALTER TABLE nodes DROP COLUMN secret_key");
                System.out.println("✅ 마이그레이션: nodes.secret_key 컬럼 제거");
            }
            var portRs = conn.getMetaData().getColumns(null, null, "nodes", "port");
            if (portRs.next()) {
                conn.createStatement().execute("ALTER TABLE nodes DROP COLUMN port");
                System.out.println("✅ 마이그레이션: nodes.port 컬럼 제거");
            }

            // 테스트용 노드 삽입 (nodes 테이블이 비어있을 때만 실행)
            var nodeCountRs = conn.createStatement().executeQuery("SELECT COUNT(*) FROM nodes");
            nodeCountRs.next();
            if (nodeCountRs.getInt(1) == 0) {
                var userRs = conn.createStatement().executeQuery("SELECT id FROM users LIMIT 1");
                if (userRs.next()) {
                    long userId = userRs.getLong("id");
                    conn.createStatement().execute(
                        "INSERT INTO nodes (user_id, name, host, os_type, status) VALUES " +
                        "(" + userId + ", 'Linux-Server', '1.209.148.228', 'Linux', 'Y'), " +
                        "(" + userId + ", 'DB-Server', '172.16.10.65', 'Linux', 'N')"
                    );
                    System.out.println("✅ 테스트 노드 2개 삽입 완료");
                }
            }
        } catch (Exception e) {
            System.err.println("❌ 마이그레이션 실패: " + e.getMessage());
        }
    }
}
