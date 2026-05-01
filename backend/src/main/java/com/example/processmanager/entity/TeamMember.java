package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class TeamMember {
    private Long id;
    private Long teamId;
    private String teamName;
    private Long userId;
    private String email;
    private String name;
    private String picture;
    private String role;
    private String status;
    private Long invitedByUserId;
    private String invitedByEmail;
    private LocalDateTime invitedAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime rejectedAt;
    private LocalDateTime cancelledAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
