package com.example.processmanager.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
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
    private Boolean canViewMonitoring;
    private Boolean canUseTerminal;
    private Boolean canControlProcesses;
    private Boolean canControlServices;
    private Long invitedByUserId;
    private String invitedByEmail;
    private String inviteTokenHash;
    private LocalDateTime inviteTokenIssuedAt;
    private LocalDateTime invitedAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime rejectedAt;
    private LocalDateTime cancelledAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
