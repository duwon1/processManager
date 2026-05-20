package com.example.processmanager.event;

public record TeamInvitationCreatedEvent(
        Long teamId,
        Long memberId,
        String teamName,
        String inviteeEmail,
        String inviteeName,
        String inviterEmail,
        String inviterName,
        String inviteToken
) {
}
