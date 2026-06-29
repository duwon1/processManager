package com.example.processmanager.config;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * deduplicateTeamMembers 는 운영 DB에 uk_team_user 유니크 제약을 추가하기 전, 기존 중복
 * (team_id, user_id) 행을 안전하게 정리합니다. 제약이 있는 정상 스키마에서는 중복을 만들 수 없으므로,
 * 제약이 없는 별도 H2 테이블에 중복 행을 직접 넣어 정리 로직과 멱등성을 검증합니다.
 */
class DatabaseMigrationConfigTest {

    private Connection h2() throws SQLException {
        // 테스트마다 격리된 인메모리 DB
        return DriverManager.getConnection(
                "jdbc:h2:mem:dedup_" + System.nanoTime() + ";DB_CLOSE_DELAY=-1");
    }

    private void seed(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement()) {
            // 유니크 제약이 없는 테이블 (구버전 운영 DB 상태를 재현)
            st.execute("CREATE TABLE dedup_test (id BIGINT PRIMARY KEY, team_id BIGINT, user_id BIGINT, status VARCHAR(30))");
            st.execute("INSERT INTO dedup_test VALUES " +
                    "(1, 1, 1, 'INVITED')," +   // (1,1) 중복 - 삭제 대상
                    "(2, 1, 1, 'ACTIVE')," +    // (1,1) ACTIVE - 유지 (상태 우선)
                    "(3, 1, 1, 'INVITED')," +   // (1,1) 중복 - 삭제 대상
                    "(4, 1, 2, 'ACTIVE')," +    // (1,2) 단건 - 유지
                    "(5, 2, 1, 'INVITED')," +   // (2,1) 중복 - 삭제 대상 (구버전)
                    "(6, 2, 1, 'INVITED')," +   // (2,1) 최신 INVITED - 유지
                    "(7, 3, 3, 'REJECTED')");   // (3,3) 단건 - 유지
        }
    }

    private Map<String, Long> keptIdByGroup(Connection conn) throws SQLException {
        Map<String, Long> result = new HashMap<>();
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT id, team_id, user_id FROM dedup_test")) {
            while (rs.next()) {
                result.put(rs.getLong("team_id") + ":" + rs.getLong("user_id"), rs.getLong("id"));
            }
        }
        return result;
    }

    private long count(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM dedup_test")) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void deduplicateKeepsBestStatusNewestRowPerGroup() throws SQLException {
        try (Connection conn = h2()) {
            seed(conn);

            int removed = DatabaseMigrationConfig.deduplicateTeamMembers(conn, "dedup_test");

            assertEquals(3, removed, "중복 3행(id 1,3,5)이 삭제돼야 합니다.");
            assertEquals(4, count(conn), "그룹별 1행씩 4행이 남아야 합니다.");

            Map<String, Long> kept = keptIdByGroup(conn);
            assertEquals(2L, kept.get("1:1"), "(1,1)은 ACTIVE 행(id 2)을 유지해야 합니다.");
            assertEquals(4L, kept.get("1:2"), "(1,2)는 id 4를 유지해야 합니다.");
            assertEquals(6L, kept.get("2:1"), "(2,1)은 최신 INVITED 행(id 6)을 유지해야 합니다.");
            assertEquals(7L, kept.get("3:3"), "(3,3)은 단건 id 7을 유지해야 합니다.");
        }
    }

    @Test
    void deduplicateIsIdempotent() throws SQLException {
        try (Connection conn = h2()) {
            seed(conn);

            DatabaseMigrationConfig.deduplicateTeamMembers(conn, "dedup_test");
            int secondPass = DatabaseMigrationConfig.deduplicateTeamMembers(conn, "dedup_test");

            assertEquals(0, secondPass, "이미 정리된 뒤에는 삭제할 중복이 없어야 합니다.");
            assertEquals(4, count(conn), "두 번째 호출이 행을 더 지우면 안 됩니다.");
        }
    }
}
