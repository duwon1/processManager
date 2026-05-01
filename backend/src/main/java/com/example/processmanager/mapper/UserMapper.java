package com.example.processmanager.mapper;

import com.example.processmanager.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserMapper {
    User findByEmail(String email);
    void insert(User user);
    void update(User user);

    // 계정 토큰으로 사용자를 조회합니다. (신규 에이전트 등록 시 호출)
    User findByAccountToken(String accountToken);

    // 계정 토큰을 갱신합니다. (재발급 시 호출)
    void updateAccountToken(@Param("email") String email, @Param("accountToken") String accountToken);

    void deleteByEmail(String email);

}
