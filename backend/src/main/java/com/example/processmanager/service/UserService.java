package com.example.processmanager.service;

import com.example.processmanager.dto.UserProfileResponse;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
public class UserService {

    private final UserMapper userMapper;

    public UserService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public void saveOrUpdate(String email, String name, String picture) {
        User existing = userMapper.findByEmail(email);
        if (existing == null) {
            userMapper.insert(User.builder()
                    .email(email)
                    .name(name)
                    .picture(picture)
                    .build());
        } else {
            userMapper.update(User.builder()
                    .email(email)
                    .name(name)
                    .picture(picture)
                    .build());
        }
    }

    public UserProfileResponse getMyProfile() {
        User user = getCurrentUser();
        return UserProfileResponse.from(user);
    }

    public void deleteMyAccount() {
        User user = getCurrentUser();
        userMapper.deleteByEmail(user.getEmail());
    }

    private User getCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new IllegalStateException("사용자를 찾을 수 없습니다: " + email);
        }
        return user;
    }
}
