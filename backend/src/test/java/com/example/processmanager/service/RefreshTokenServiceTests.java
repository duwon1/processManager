package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenServiceTests {

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
