package com.example.processmanager.dto;

import com.example.processmanager.entity.Team;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class TeamResponse {
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

    public static TeamResponse from(Team team) {
        return TeamResponse.builder()
                .id(team.getId())
                .ownerUserId(team.getOwnerUserId())
                .ownerEmail(team.getOwnerEmail())
                .name(team.getName())
                .description(team.getDescription())
                .role(team.getRole())
                .status(team.getStatus())
                .memberCount(team.getMemberCount() == null ? 0 : team.getMemberCount())
                .nodeCount(team.getNodeCount() == null ? 0 : team.getNodeCount())
                .createdAt(team.getCreatedAt())
                .build();
    }
}
