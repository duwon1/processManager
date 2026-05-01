package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class Team {
    private Long id;
    private Long ownerUserId;
    private String ownerEmail;
    private String name;
    private String description;
    private String role;
    private String status;
    private Integer memberCount;
    private Integer nodeCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
