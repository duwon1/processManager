package com.example.processmanager.mapper;

import com.example.processmanager.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {
    User findByEmail(String email);
    void insert(User user);
    void update(User user);
}
