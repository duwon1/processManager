package com.example.processmanager.controller;

import com.example.processmanager.dto.TeamInviteRequest;
import com.example.processmanager.dto.TeamMemberResponse;
import com.example.processmanager.dto.TeamMemberPermissionRequest;
import com.example.processmanager.dto.TeamNodeOptionResponse;
import com.example.processmanager.dto.TeamNodeUpdateRequest;
import com.example.processmanager.dto.TeamRequest;
import com.example.processmanager.dto.TeamResponse;
import com.example.processmanager.service.TeamService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@Tag(name = "Team", description = "팀 관리, 멤버 초대·권한, 노드 공유")
@RestController
@RequestMapping("/api/team")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @Operation(summary = "팀 목록 조회", description = "내가 소유하거나 소속된 팀 목록을 반환합니다.")
    @GetMapping("/list")
    public ResponseEntity<List<TeamResponse>> list() {
        return ResponseEntity.ok(teamService.getMyTeams());
    }

    @Operation(summary = "팀 생성", description = "새 팀을 생성합니다. 생성자가 OWNER가 됩니다.")
    @PostMapping
    public ResponseEntity<TeamResponse> create(@RequestBody TeamRequest request) {
        return ResponseEntity.ok(teamService.createTeam(request));
    }

    @Operation(summary = "팀 수정", description = "팀 이름·설명을 수정합니다. (OWNER)")
    @PatchMapping("/{teamId}")
    public ResponseEntity<TeamResponse> update(@PathVariable Long teamId, @RequestBody TeamRequest request) {
        return ResponseEntity.ok(teamService.updateTeam(teamId, request));
    }

    @Operation(summary = "팀 삭제", description = "팀을 삭제합니다. (OWNER)")
    @DeleteMapping("/{teamId}")
    public ResponseEntity<Void> delete(@PathVariable Long teamId) {
        teamService.deleteTeam(teamId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "팀 탈퇴", description = "현재 사용자가 해당 팀에서 탈퇴합니다.")
    @DeleteMapping("/{teamId}/membership")
    public ResponseEntity<Void> leave(@PathVariable Long teamId) {
        teamService.leaveTeam(teamId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "팀 멤버 목록", description = "팀 구성원 목록을 반환합니다.")
    @GetMapping("/{teamId}/members")
    public ResponseEntity<List<TeamMemberResponse>> members(@PathVariable Long teamId) {
        return ResponseEntity.ok(teamService.getMembers(teamId));
    }

    @Operation(summary = "멤버 초대", description = "이메일로 팀 구성원을 초대합니다. 초대 메일·알림을 발송합니다.")
    @PostMapping("/{teamId}/members/invite")
    public ResponseEntity<Map<String, String>> invite(
            @PathVariable Long teamId,
            @RequestBody TeamInviteRequest request
    ) {
        return ResponseEntity.ok(Map.of("message", teamService.inviteMember(teamId, request)));
    }

    @Operation(summary = "멤버 제거", description = "팀에서 구성원을 제거합니다. (OWNER)")
    @DeleteMapping("/{teamId}/members/{memberId}")
    public ResponseEntity<Void> removeMember(@PathVariable Long teamId, @PathVariable Long memberId) {
        teamService.removeMember(teamId, memberId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "멤버 권한 수정", description = "구성원별 노드 접근 권한(모니터링/터미널/프로세스/서비스)을 수정합니다. (OWNER)")
    @PatchMapping("/{teamId}/members/{memberId}/permissions")
    public ResponseEntity<TeamMemberResponse> updateMemberPermissions(
            @PathVariable Long teamId,
            @PathVariable Long memberId,
            @RequestBody TeamMemberPermissionRequest request
    ) {
        return ResponseEntity.ok(teamService.updateMemberPermissions(teamId, memberId, request));
    }

    @Operation(summary = "내 초대 목록", description = "현재 사용자에게 온 대기 중 초대 목록을 반환합니다.")
    @GetMapping("/invitations")
    public ResponseEntity<List<TeamMemberResponse>> invitations() {
        return ResponseEntity.ok(teamService.getMyInvitations());
    }

    @Operation(summary = "초대 링크 조회", description = "초대 링크 토큰으로 초대 정보를 조회합니다.")
    @GetMapping("/invitations/link/{token}")
    public ResponseEntity<TeamMemberResponse> invitationByLink(@PathVariable String token) {
        return ResponseEntity.ok(teamService.getInvitationByToken(token));
    }

    @Operation(summary = "초대 수락", description = "멤버 ID로 초대를 수락합니다.")
    @PostMapping("/invitations/{memberId}/accept")
    public ResponseEntity<Void> accept(@PathVariable Long memberId) {
        teamService.acceptInvitation(memberId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "초대 거절", description = "멤버 ID로 초대를 거절합니다.")
    @PostMapping("/invitations/{memberId}/reject")
    public ResponseEntity<Void> reject(@PathVariable Long memberId) {
        teamService.rejectInvitation(memberId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "초대 링크로 수락", description = "초대 링크 토큰으로 초대를 수락합니다.")
    @PostMapping("/invitations/link/{token}/accept")
    public ResponseEntity<TeamMemberResponse> acceptByLink(@PathVariable String token) {
        return ResponseEntity.ok(teamService.acceptInvitationByToken(token));
    }

    @Operation(summary = "초대 링크로 거절", description = "초대 링크 토큰으로 초대를 거절합니다.")
    @PostMapping("/invitations/link/{token}/reject")
    public ResponseEntity<TeamMemberResponse> rejectByLink(@PathVariable String token) {
        return ResponseEntity.ok(teamService.rejectInvitationByToken(token));
    }

    @Operation(summary = "팀 공유 가능 노드 조회", description = "팀에 공유할 수 있는 내 노드 목록과 현재 공유 여부를 반환합니다.")
    @GetMapping("/{teamId}/node-options")
    public ResponseEntity<List<TeamNodeOptionResponse>> nodeOptions(@PathVariable Long teamId) {
        return ResponseEntity.ok(teamService.getNodeOptions(teamId));
    }

    @Operation(summary = "팀 공유 노드 갱신", description = "팀에 공유할 노드 집합을 전달한 nodeIds로 덮어씁니다.")
    @PutMapping("/{teamId}/nodes")
    public ResponseEntity<List<TeamNodeOptionResponse>> updateNodes(
            @PathVariable Long teamId,
            @RequestBody TeamNodeUpdateRequest request
    ) {
        return ResponseEntity.ok(teamService.updateTeamNodes(teamId, request));
    }
}
