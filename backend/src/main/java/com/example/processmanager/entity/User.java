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
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
