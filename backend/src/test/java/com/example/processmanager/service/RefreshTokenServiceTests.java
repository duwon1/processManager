package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshTokenServiceTests {

    @Test
    void verifyReturnsEmailWhenCookieTokenMatches() {
        InMemoryRefreshTokenStore store = new InMemoryRefreshTokenStore();
        RefreshTokenService service = new RefreshTokenService(store);
        String cookieValue = service.issue("victim@example.com");

        assertThat(service.verify(cookieValue)).isEqualTo("victim@example.com");
    }

    @Test
    void verifyRejectsMismatchedTokenWithoutDeletingStoredToken() {
        InMemoryRefreshTokenStore store = new InMemoryRefreshTokenStore();
        RefreshTokenService service = new RefreshTokenService(store);
        String cookieValue = service.issue("victim@example.com");

        assertThatThrownBy(() -> service.verify("victim@example.com|attacker-controlled-token"))
                .isInstanceOf(IllegalArgumentException.class);

        // 이메일만 아는 공격자가 피해자의 세션을 강제로 끊을 수 없어야 합니다.
        assertThat(store.deletedEmail).isNull();
        assertThat(store.stored).isNotNull();
        assertThat(service.verify(cookieValue)).isEqualTo("victim@example.com");
    }

    @Test
    void revokeIfValidDeletesOnlyWhenCookieTokenMatchesStoredHash() {
        InMemoryRefreshTokenStore store = new InMemoryRefreshTokenStore();
        RefreshTokenService service = new RefreshTokenService(store);
        String cookieValue = service.issue("victim@example.com");

        boolean revoked = service.revokeIfValid(cookieValue);

        assertThat(revoked).isTrue();
        assertThat(store.deletedEmail).isEqualTo("victim@example.com");
    }

    @Test
    void revokeIfValidDoesNotDeleteStoredTokenWhenCookieTokenDoesNotMatch() {
        InMemoryRefreshTokenStore store = new InMemoryRefreshTokenStore();
        RefreshTokenService service = new RefreshTokenService(store);
        service.issue("victim@example.com");

        boolean revoked = service.revokeIfValid("victim@example.com|attacker-controlled-token");

        assertThat(revoked).isFalse();
        assertThat(store.deletedEmail).isNull();
        assertThat(store.stored).isNotNull();
    }

    private static final class InMemoryRefreshTokenStore implements RefreshTokenStore {
        private RefreshToken stored;
        private String deletedEmail;

        @Override
        public void upsert(RefreshToken refreshToken) {
            stored = refreshToken;
        }

        @Override
        public RefreshToken findByUserEmail(String userEmail) {
            return stored != null && stored.getUserEmail().equals(userEmail) ? stored : null;
        }

        @Override
        public void deleteByUserEmail(String userEmail) {
            deletedEmail = userEmail;
            if (stored != null && stored.getUserEmail().equals(userEmail)) {
                stored = null;
            }
        }
    }
}
