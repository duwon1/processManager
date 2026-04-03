package com.example.processmanager.mapper;

import com.example.processmanager.entity.RefreshToken;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface RefreshTokenMapper {

    // 발급 또는 교체: 유저당 1개만 유지 (ON DUPLICATE KEY UPDATE)
    void upsert(RefreshToken refreshToken);

    // 이메일로 토큰 조회 (검증 시 사용)
    RefreshToken findByUserEmail(String userEmail);

    // 로그아웃 또는 토큰 폐기 시 삭제
    void deleteByUserEmail(@Param("userEmail") String userEmail);
}
