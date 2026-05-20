package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;
import com.example.processmanager.mapper.RefreshTokenMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnProperty(name = "app.refresh-token.store", havingValue = "database", matchIfMissing = true)
public class DatabaseRefreshTokenStore implements RefreshTokenStore {

    private final RefreshTokenMapper refreshTokenMapper;

    public DatabaseRefreshTokenStore(RefreshTokenMapper refreshTokenMapper) {
        this.refreshTokenMapper = refreshTokenMapper;
    }

    @Override
    public void upsert(RefreshToken refreshToken) {
        refreshTokenMapper.upsert(refreshToken);
    }

    @Override
    public RefreshToken findByUserEmail(String userEmail) {
        return refreshTokenMapper.findByUserEmail(userEmail);
    }

    @Override
    public void deleteByUserEmail(String userEmail) {
        refreshTokenMapper.deleteByUserEmail(userEmail);
    }
}
