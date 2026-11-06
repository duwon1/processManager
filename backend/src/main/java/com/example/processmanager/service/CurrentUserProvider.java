package com.example.processmanager.service;

import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * JWT 인증으로 SecurityContext에 저장된 이메일로 현재 로그인 사용자를 조회합니다.
 * 여러 서비스에 흩어져 있던 동일한 getCurrentUser() 구현을 한곳으로 모았습니다.
 */
@Component
public class CurrentUserProvider {

    private final UserMapper userMapper;

    public CurrentUserProvider(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    // 현재 사용자를 조회합니다. 없으면 null을 반환합니다.
    public User findCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userMapper.findByEmail(email);
    }

    // 현재 사용자를 조회하고, 없으면 IllegalStateException을 던집니다.
    public User requireCurrentUser() {
        User user = findCurrentUser();
        if (user == null) {
            throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        }
        return user;
    }
}
