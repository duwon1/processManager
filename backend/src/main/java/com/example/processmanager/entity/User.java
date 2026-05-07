package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class User {
    private Long id;
    private String email;
    private String name;
    private String picture;
    private String accountToken; // 구버전 호환용 컬럼. 신규 에이전트 등록은 1회용 설치 토큰을 사용합니다.
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
