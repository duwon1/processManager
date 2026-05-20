package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;

public interface RefreshTokenStore {
    void upsert(RefreshToken refreshToken);

    RefreshToken findByUserEmail(String userEmail);

    void deleteByUserEmail(String userEmail);
}
