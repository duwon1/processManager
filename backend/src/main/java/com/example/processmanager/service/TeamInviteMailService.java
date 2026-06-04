package com.example.processmanager.service;

import com.example.processmanager.event.TeamInvitationCreatedEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class TeamInviteMailService {

    private static final int INVITE_EXPIRATION_MINUTES = 30;

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
        String inviteUrl = UriComponentsBuilder.fromUriString(publicUrl)
                .pathSegment("invite", event.inviteToken())
                .build()
                .toUriString();

        String subject = "[Process Manager] 팀 초대가 도착했습니다";
        String textBody = """
                안녕하세요, %s님.

                %s님이 Process Manager의 '%s' 팀에 초대했습니다.

                로그인한 뒤 초대 확인 화면에서 초대를 수락하거나 거절할 수 있습니다.
                초대 링크는 발송 시점부터 %d분 동안만 유효합니다.
                %s

                이 메일은 자동 발송되었습니다.
                """.formatted(invitee, inviter, event.teamName(), INVITE_EXPIRATION_MINUTES, inviteUrl);
        String htmlBody = buildInvitationHtml(invitee, inviter, event.teamName(), inviteUrl);

        mailService.sendHtml(event.inviteeEmail(), subject, textBody, htmlBody);
    }

    private String firstNonBlank(String primary, String secondary, String fallback) {
        if (primary != null && !primary.isBlank()) return primary;
        if (secondary != null && !secondary.isBlank()) return secondary;
        return fallback;
    }

    private String buildInvitationHtml(String invitee, String inviter, String teamName, String teamsUrl) {
        String safeInvitee = escapeHtml(invitee);
        String safeInviter = escapeHtml(inviter);
        String safeTeamName = escapeHtml(teamName);
        String safeTeamsUrl = escapeHtml(teamsUrl);

        return """
                <!doctype html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Process Manager 팀 초대</title>
                </head>
                <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#172033;">
                  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">%s님, Process Manager 팀 초대가 도착했습니다.</div>
                  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dde7f3;box-shadow:0 12px 32px rgba(23,32,51,0.10);">
                          <tr>
                            <td style="background:#152033;padding:28px 30px;color:#ffffff;">
                              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6ee7f9;font-weight:700;">Process Manager</div>
                              <h1 style="margin:10px 0 0;font-size:24px;line-height:1.35;font-weight:800;">팀 초대가 도착했습니다</h1>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:30px;">
                              <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">안녕하세요, <strong>%s</strong>님.</p>
                              <p style="margin:0 0 22px;font-size:16px;line-height:1.7;"><strong>%s</strong>님이 아래 팀에 초대했습니다.</p>
                              <div style="background:#eef8fb;border:1px solid #c8edf5;border-radius:14px;padding:18px 20px;margin:0 0 24px;">
                                <div style="font-size:12px;color:#4f6278;font-weight:700;margin-bottom:6px;">초대된 팀</div>
                                <div style="font-size:20px;line-height:1.4;color:#102033;font-weight:800;">%s</div>
                              </div>
                              <a href="%s" style="display:inline-block;background:#0dcaf0;color:#07131c;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 20px;font-size:15px;">팀 초대 확인하기</a>
                              <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;">이 초대 링크는 발송 시점부터 %d분 동안만 유효합니다.</p>
                              <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#5b6b80;">버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣어 초대 확인 화면에서 수락하거나 거절하세요.</p>
                              <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#2f6f86;word-break:break-all;">%s</p>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #e6edf5;color:#758397;font-size:12px;line-height:1.6;">
                              이 메일은 자동 발송되었습니다. 요청하지 않은 초대라면 무시해도 됩니다.
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """.formatted(safeInvitee, safeInvitee, safeInviter, safeTeamName, safeTeamsUrl, INVITE_EXPIRATION_MINUTES, safeTeamsUrl);
    }

    private String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
