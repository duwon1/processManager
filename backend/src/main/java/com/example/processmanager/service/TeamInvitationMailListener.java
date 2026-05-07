package com.example.processmanager.service;

import com.example.processmanager.event.TeamInvitationCreatedEvent;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class TeamInvitationMailListener {

    private final TeamInviteMailService teamInviteMailService;

    public TeamInvitationMailListener(TeamInviteMailService teamInviteMailService) {
        this.teamInviteMailService = teamInviteMailService;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleTeamInvitationCreated(TeamInvitationCreatedEvent event) {
        teamInviteMailService.sendInvitation(event);
    }
}
