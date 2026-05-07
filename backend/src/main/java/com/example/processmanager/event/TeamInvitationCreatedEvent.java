package com.example.processmanager.event;

public record TeamInvitationCreatedEvent(
        Long teamId,
        String teamName,
        String inviteeEmail,
        String inviteeName,
        String inviterEmail,
        String inviterName
) {
}
