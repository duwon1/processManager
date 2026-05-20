package com.example.processmanager.service;

import com.example.processmanager.dto.TeamInviteRequest;
import com.example.processmanager.dto.TeamMemberResponse;
import com.example.processmanager.dto.TeamMemberPermissionRequest;
import com.example.processmanager.dto.TeamNodeOptionResponse;
import com.example.processmanager.dto.TeamNodeUpdateRequest;
import com.example.processmanager.dto.TeamRequest;
import com.example.processmanager.dto.TeamResponse;
import com.example.processmanager.entity.Team;
import com.example.processmanager.entity.TeamMember;
import com.example.processmanager.entity.User;
import com.example.processmanager.event.TeamInvitationCreatedEvent;
import com.example.processmanager.mapper.TeamMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class TeamService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Pattern INVITE_TOKEN_PATTERN = Pattern.compile("^pmt_[0-9a-f]{64}$");

    private final TeamMapper teamMapper;
    private final UserMapper userMapper;
    private final ApplicationEventPublisher eventPublisher;

    public TeamService(TeamMapper teamMapper, UserMapper userMapper, ApplicationEventPublisher eventPublisher) {
        this.teamMapper = teamMapper;
        this.userMapper = userMapper;
        this.eventPublisher = eventPublisher;
    }

    private User getCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        }
        return user;
    }

    public List<TeamResponse> getMyTeams() {
        User user = getCurrentUser();
        return teamMapper.findTeamsByUserId(user.getId()).stream()
                .map(TeamResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public TeamResponse createTeam(TeamRequest request) {
        User user = getCurrentUser();
        String name = normalizeName(request == null ? null : request.name());
        String description = normalizeDescription(request == null ? null : request.description());

        if (teamMapper.findByOwnerUserIdAndName(user.getId(), name) != null) {
            throw new IllegalArgumentException("이미 같은 이름의 팀이 있습니다.");
        }

        Team team = Team.builder()
                .ownerUserId(user.getId())
                .ownerEmail(user.getEmail())
                .name(name)
                .description(description)
                .build();
        teamMapper.insertTeam(team);
        Team persistedTeam = team.getId() == null ? teamMapper.findByOwnerUserIdAndName(user.getId(), name) : team;
        if (persistedTeam == null || persistedTeam.getId() == null) {
            throw new IllegalStateException("생성된 팀을 확인할 수 없습니다.");
        }
        // 팀 생성자는 즉시 OWNER/ACTIVE 멤버로 등록되어야 팀 목록과 관리 권한이 정상 동작합니다.
        teamMapper.insertOwnerMember(persistedTeam.getId(), user.getId());

        Team created = teamMapper.findTeamsByUserId(user.getId()).stream()
                .filter(item -> item.getId().equals(persistedTeam.getId()))
                .findFirst()
                .orElse(persistedTeam);
        return TeamResponse.from(created);
    }

    @Transactional
    public TeamResponse updateTeam(Long teamId, TeamRequest request) {
        User user = getCurrentUser();
        Team team = requireOwnerTeam(teamId, user);
        String name = normalizeName(request == null ? null : request.name());
        String description = normalizeDescription(request == null ? null : request.description());

        Team duplicate = teamMapper.findByOwnerUserIdAndName(team.getOwnerUserId(), name);
        if (duplicate != null && !duplicate.getId().equals(teamId)) {
            throw new IllegalArgumentException("이미 같은 이름의 팀이 있습니다.");
        }

        int updated = teamMapper.updateTeam(Team.builder()
                .id(teamId)
                .ownerUserId(team.getOwnerUserId())
                .name(name)
                .description(description)
                .build());
        if (updated == 0) {
            throw new IllegalStateException("팀 정보를 저장할 수 없습니다.");
        }

        return TeamResponse.from(Team.builder()
                .id(team.getId())
                .ownerUserId(team.getOwnerUserId())
                .ownerEmail(team.getOwnerEmail())
                .name(name)
                .description(description)
                .role("OWNER")
                .status("ACTIVE")
                .memberCount(team.getMemberCount())
                .nodeCount(team.getNodeCount())
                .createdAt(team.getCreatedAt())
                .build());
    }

    public void deleteTeam(Long teamId) {
        User user = getCurrentUser();
        Team team = requireOwnerTeam(teamId, user);
        int deleted = teamMapper.deleteTeamByIdAndOwnerUserId(teamId, team.getOwnerUserId());
        if (deleted == 0) {
            throw new SecurityException("팀 삭제 권한이 없습니다.");
        }
    }

    public List<TeamMemberResponse> getMembers(Long teamId) {
        User user = getCurrentUser();
        requireManagerTeam(teamId, user);
        return teamMapper.findMembersByTeamId(teamId).stream()
                .map(TeamMemberResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public String inviteMember(Long teamId, TeamInviteRequest request) {
        User inviter = getCurrentUser();
        TeamMember manager = requireManagerTeam(teamId, inviter);
        String email = normalizeEmail(request == null ? null : request.email());

        if (inviter.getEmail() != null && inviter.getEmail().equalsIgnoreCase(email)) {
            throw new IllegalArgumentException("자기 자신은 초대할 수 없습니다.");
        }

        User target = userMapper.findByEmail(email);
        if (target == null) {
            throw new IllegalArgumentException("가입된 사용자만 초대할 수 있습니다.");
        }

        // 초대는 재전송/재초대가 같은 성공 문구를 반환하도록 유지해 사용자가 상태 차이를 외우지 않아도 되게 합니다.
        TeamMember existing = teamMapper.findMemberByTeamIdAndUserId(teamId, target.getId());
        if (existing == null) {
            String inviteToken = generateInviteToken();
            teamMapper.insertInvite(teamId, target.getId(), inviter.getId(), hashToken(inviteToken));
            TeamMember created = teamMapper.findMemberByTeamIdAndUserId(teamId, target.getId());
            if (created == null || created.getId() == null) {
                throw new IllegalStateException("초대 정보를 확인할 수 없습니다.");
            }
            publishInvitation(teamId, created.getId(), manager.getTeamName(), target, inviter, inviteToken);
            return "초대 요청을 처리했습니다.";
        }

        if ("INVITED".equals(existing.getStatus())) {
            String inviteToken = generateInviteToken();
            teamMapper.refreshInviteLink(existing.getId(), inviter.getId(), hashToken(inviteToken));
            publishInvitation(teamId, existing.getId(), manager.getTeamName(), target, inviter, inviteToken);
            return "초대 요청을 처리했습니다.";
        }

        if ("REJECTED".equals(existing.getStatus())
                || "CANCELLED".equals(existing.getStatus())
                || "REMOVED".equals(existing.getStatus())) {
            String inviteToken = generateInviteToken();
            teamMapper.reactivateInvite(existing.getId(), inviter.getId(), hashToken(inviteToken));
            publishInvitation(teamId, existing.getId(), manager.getTeamName(), target, inviter, inviteToken);
        }
        return "초대 요청을 처리했습니다.";
    }

    public List<TeamMemberResponse> getMyInvitations() {
        User user = getCurrentUser();
        return teamMapper.findInvitationsByUserId(user.getId()).stream()
                .map(TeamMemberResponse::from)
                .collect(Collectors.toList());
    }

    public void acceptInvitation(Long memberId) {
        User user = getCurrentUser();
        int updated = teamMapper.acceptInvitation(memberId, user.getId());
        if (updated == 0) {
            throw new SecurityException("수락할 수 없는 초대입니다.");
        }
    }

    public void rejectInvitation(Long memberId) {
        User user = getCurrentUser();
        int updated = teamMapper.rejectInvitation(memberId, user.getId());
        if (updated == 0) {
            throw new SecurityException("거절할 수 없는 초대입니다.");
        }
    }

    public TeamMemberResponse getInvitationByToken(String rawToken) {
        User user = getCurrentUser();
        TeamMember member = requireInviteTokenMember(rawToken);
        requireInvitee(member, user);
        return TeamMemberResponse.from(member);
    }

    public TeamMemberResponse acceptInvitationByToken(String rawToken) {
        User user = getCurrentUser();
        TeamMember member = requireInviteTokenMember(rawToken);
        requireInvitee(member, user);
        requirePendingInvitation(member);

        int updated = teamMapper.acceptInvitation(member.getId(), user.getId());
        if (updated == 0) {
            throw new IllegalStateException("이미 처리된 초대입니다.");
        }
        return TeamMemberResponse.from(teamMapper.findMemberById(member.getId()));
    }

    public TeamMemberResponse rejectInvitationByToken(String rawToken) {
        User user = getCurrentUser();
        TeamMember member = requireInviteTokenMember(rawToken);
        requireInvitee(member, user);
        requirePendingInvitation(member);

        int updated = teamMapper.rejectInvitation(member.getId(), user.getId());
        if (updated == 0) {
            throw new IllegalStateException("이미 처리된 초대입니다.");
        }
        return TeamMemberResponse.from(teamMapper.findMemberById(member.getId()));
    }

    @Transactional
    public void removeMember(Long teamId, Long memberId) {
        User user = getCurrentUser();
        requireManagerTeam(teamId, user);
        TeamMember member = teamMapper.findMemberById(memberId);
        if (member == null || !teamId.equals(member.getTeamId())) {
            throw new IllegalArgumentException("팀원을 찾을 수 없습니다.");
        }
        if ("OWNER".equals(member.getRole())) {
            throw new IllegalArgumentException("팀 소유자는 제거할 수 없습니다.");
        }

        int updated;
        if ("INVITED".equals(member.getStatus())) {
            updated = teamMapper.cancelInvitation(memberId, teamId);
        } else {
            updated = teamMapper.removeMember(memberId, teamId);
        }
        if (updated == 0) {
            throw new IllegalArgumentException("팀원 상태를 변경할 수 없습니다.");
        }
    }

    @Transactional
    public TeamMemberResponse updateMemberPermissions(Long teamId, Long memberId, TeamMemberPermissionRequest request) {
        User user = getCurrentUser();
        requireOwnerTeam(teamId, user);
        TeamMember member = teamMapper.findMemberById(memberId);
        if (member == null || !teamId.equals(member.getTeamId())) {
            throw new IllegalArgumentException("팀원을 찾을 수 없습니다.");
        }
        if ("OWNER".equals(member.getRole())) {
            throw new IllegalArgumentException("팀 소유자 권한은 변경할 수 없습니다.");
        }

        TeamMemberPermissionRequest normalized = normalizePermissions(request);
        int updated = teamMapper.updateMemberPermissions(memberId, teamId, normalized);
        if (updated == 0) {
            throw new IllegalStateException("팀원 권한을 저장할 수 없습니다.");
        }
        return TeamMemberResponse.from(teamMapper.findMemberById(memberId));
    }

    public List<TeamNodeOptionResponse> getNodeOptions(Long teamId) {
        User user = getCurrentUser();
        requireOwnerTeam(teamId, user);
        return teamMapper.findNodeOptions(teamId, user.getId()).stream()
                .map(TeamNodeOptionResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional
    public List<TeamNodeOptionResponse> updateTeamNodes(Long teamId, TeamNodeUpdateRequest request) {
        User user = getCurrentUser();
        requireOwnerTeam(teamId, user);

        Set<Long> requestedIds = new LinkedHashSet<>();
        if (request != null && request.nodeIds() != null) {
            request.nodeIds().stream()
                    .filter(id -> id != null && id > 0)
                    .forEach(requestedIds::add);
        }

        if (!requestedIds.isEmpty()) {
            List<Long> ownedIds = teamMapper.findOwnedNodeIds(user.getId(), List.copyOf(requestedIds));
            if (ownedIds.size() != requestedIds.size()) {
                throw new SecurityException("본인이 소유한 노드만 팀에 공유할 수 있습니다.");
            }
        }

        teamMapper.deleteTeamNodes(teamId);
        for (Long nodeId : requestedIds) {
            teamMapper.insertTeamNode(teamId, nodeId, user.getId());
        }
        return getNodeOptions(teamId);
    }

    private Team requireOwnerTeam(Long teamId, User user) {
        TeamMember member = teamMapper.findMemberByTeamIdAndUserId(teamId, user.getId());
        if (member == null || !"ACTIVE".equals(member.getStatus()) || !"OWNER".equals(member.getRole())) {
            throw new SecurityException("팀 소유자 권한이 필요합니다.");
        }
        Team team = teamMapper.findById(teamId);
        if (team == null) {
            throw new IllegalArgumentException("팀을 찾을 수 없습니다.");
        }
        return team;
    }

    private TeamMember requireManagerTeam(Long teamId, User user) {
        TeamMember member = teamMapper.findMemberByTeamIdAndUserId(teamId, user.getId());
        if (member == null || !"ACTIVE".equals(member.getStatus())
                || !("OWNER".equals(member.getRole()) || "ADMIN".equals(member.getRole()))) {
            throw new SecurityException("팀 관리 권한이 필요합니다.");
        }
        return member;
    }

    private String normalizeName(String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        if (name.isBlank()) {
            throw new IllegalArgumentException("팀 이름을 입력해주세요.");
        }
        if (name.length() > 100) {
            throw new IllegalArgumentException("팀 이름은 100자 이하로 입력해주세요.");
        }
        return name;
    }

    private String normalizeDescription(String rawDescription) {
        String description = rawDescription == null ? "" : rawDescription.trim();
        if (description.length() > 255) {
            throw new IllegalArgumentException("팀 설명은 255자 이하로 입력해주세요.");
        }
        return description;
    }

    private String normalizeEmail(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim();
        if (email.isBlank()) {
            throw new IllegalArgumentException("초대할 이메일을 입력해주세요.");
        }
        if (email.length() > 255 || !email.contains("@")) {
            throw new IllegalArgumentException("올바른 이메일을 입력해주세요.");
        }
        return email;
    }

    private TeamMemberPermissionRequest normalizePermissions(TeamMemberPermissionRequest request) {
        boolean terminal = request != null && Boolean.TRUE.equals(request.canUseTerminal());
        boolean files = request != null && Boolean.TRUE.equals(request.canViewFiles());
        boolean processControl = request != null && Boolean.TRUE.equals(request.canControlProcesses());
        boolean serviceControl = request != null && Boolean.TRUE.equals(request.canControlServices());
        boolean viewMonitoring = request == null
                || request.canViewMonitoring() == null
                || Boolean.TRUE.equals(request.canViewMonitoring())
                || terminal || files || processControl || serviceControl;
        // 세부 기능은 모니터링 화면에서 진입하므로, 하나라도 허용되면 기본 조회 권한도 함께 켭니다.
        return new TeamMemberPermissionRequest(
                viewMonitoring,
                files,
                terminal,
                processControl,
                serviceControl
        );
    }

    private TeamMember requireInviteTokenMember(String rawToken) {
        String token = normalizeInviteToken(rawToken);
        TeamMember member = teamMapper.findMemberByInviteTokenHash(hashToken(token));
        if (member == null) {
            throw new IllegalArgumentException("유효하지 않은 초대 링크입니다.");
        }
        return member;
    }

    private void requireInvitee(TeamMember member, User user) {
        if (member.getUserId() == null || user.getId() == null || !member.getUserId().equals(user.getId())) {
            throw new IllegalArgumentException("초대받은 계정으로 로그인해주세요.");
        }
    }

    private void requirePendingInvitation(TeamMember member) {
        if (!"INVITED".equals(member.getStatus())) {
            throw new IllegalStateException("이미 처리된 초대입니다.");
        }
    }

    private String normalizeInviteToken(String rawToken) {
        String token = rawToken == null ? "" : rawToken.trim();
        if (!INVITE_TOKEN_PATTERN.matcher(token).matches()) {
            throw new IllegalArgumentException("유효하지 않은 초대 링크입니다.");
        }
        return token;
    }

    private String generateInviteToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder("pmt_");
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("초대 링크를 처리할 수 없습니다.", e);
        }
    }

    private void publishInvitation(Long teamId, Long memberId, String teamName, User target, User inviter, String inviteToken) {
        eventPublisher.publishEvent(new TeamInvitationCreatedEvent(
                teamId,
                memberId,
                teamName,
                target.getEmail(),
                target.getName(),
                inviter.getEmail(),
                inviter.getName(),
                inviteToken
        ));
    }
}
