package com.example.processmanager.service;

import com.example.processmanager.event.TeamInvitationCreatedEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class TeamInviteMailService {

    private final MailService mailService;
    private final String publicUrl;

    public TeamInviteMailService(
            MailService mailService,
            @Value("${app.public-url:http://localhost:5173}") String publicUrl
    ) {
        this.mailService = mailService;
        this.publicUrl = publicUrl == null || publicUrl.isBlank()
                ? "http://localhost:5173"
                : publicUrl.replaceAll("/+$", "");
    }

    public void sendInvitation(TeamInvitationCreatedEvent event) {
        String inviter = firstNonBlank(event.inviterName(), event.inviterEmail(), "팀 관리자");
        String invitee = firstNonBlank(event.inviteeName(), event.inviteeEmail(), "사용자");
        String teamsUrl = UriComponentsBuilder.fromUriString(publicUrl)
                .path("/teams")
                .build()
                .toUriString();

        String subject = "[Process Manager] 팀 초대가 도착했습니다";
        String body = """
                안녕하세요, %s님.

                %s님이 Process Manager의 '%s' 팀에 초대했습니다.

                로그인한 뒤 팀 관리 화면에서 초대를 수락하거나 거절할 수 있습니다.
                %s

                이 메일은 자동 발송되었습니다.
                """.formatted(invitee, inviter, event.teamName(), teamsUrl);

        mailService.sendText(event.inviteeEmail(), subject, body);
    }

    private String firstNonBlank(String primary, String secondary, String fallback) {
        if (primary != null && !primary.isBlank()) return primary;
        if (secondary != null && !secondary.isBlank()) return secondary;
        return fallback;
    }
}
