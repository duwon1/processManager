package com.example.processmanager.service;

import com.example.processmanager.entity.User;
import com.example.processmanager.event.TeamInvitationCreatedEvent;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class TeamInvitationNotificationListener {

    private final UserMapper userMapper;
    private final NotificationService notificationService;

    public TeamInvitationNotificationListener(UserMapper userMapper, NotificationService notificationService) {
        this.userMapper = userMapper;
        this.notificationService = notificationService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleTeamInvitationCreated(TeamInvitationCreatedEvent event) {
        User invitee = userMapper.findByEmail(event.inviteeEmail());
        if (invitee == null) {
            return;
        }

        String inviter = event.inviterName() != null && !event.inviterName().isBlank()
                ? event.inviterName()
                : event.inviterEmail();
        String message = inviter + "님이 '" + event.teamName() + "' 팀에 초대했습니다.";

        notificationService.createPersistent(
                invitee.getId(),
                "TEAM_INVITATION",
                "info",
                "팀 초대가 도착했습니다.",
                message,
                "/teams",
                "TEAM",
                event.teamId(),
                "team-invitation:" + event.teamId() + ":" + invitee.getId()
        );
    }
}
