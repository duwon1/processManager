package com.example.processmanager.dto;

import com.example.processmanager.entity.TeamMember;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class TeamMemberResponse {
    private Long id;
    private Long teamId;
    private String teamName;
    private Long userId;
    private String email;
    private String name;
    private String picture;
    private String role;
    private String status;
    private String invitedByEmail;
    private LocalDateTime invitedAt;
    private LocalDateTime acceptedAt;

    public static TeamMemberResponse from(TeamMember member) {
        return TeamMemberResponse.builder()
                .id(member.getId())
                .teamId(member.getTeamId())
                .teamName(member.getTeamName())
                .userId(member.getUserId())
                .email(member.getEmail())
                .name(member.getName())
                .picture(member.getPicture())
                .role(member.getRole())
                .status(member.getStatus())
                .invitedByEmail(member.getInvitedByEmail())
                .invitedAt(member.getInvitedAt())
                .acceptedAt(member.getAcceptedAt())
                .build();
    }
}
