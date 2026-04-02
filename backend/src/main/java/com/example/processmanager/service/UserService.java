package com.example.processmanager.service;

import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.UserMapper;
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
}
