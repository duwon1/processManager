package com.example.processmanager.controller;

import com.example.processmanager.dto.TeamInviteRequest;
import com.example.processmanager.dto.TeamMemberResponse;
import com.example.processmanager.dto.TeamNodeOptionResponse;
import com.example.processmanager.dto.TeamNodeUpdateRequest;
import com.example.processmanager.dto.TeamRequest;
import com.example.processmanager.dto.TeamResponse;
import com.example.processmanager.service.TeamService;
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

@RestController
@RequestMapping("/api/team")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping("/list")
    public ResponseEntity<List<TeamResponse>> list() {
        return ResponseEntity.ok(teamService.getMyTeams());
    }

    @PostMapping
    public ResponseEntity<TeamResponse> create(@RequestBody TeamRequest request) {
        return ResponseEntity.ok(teamService.createTeam(request));
    }

    @PatchMapping("/{teamId}")
    public ResponseEntity<TeamResponse> update(@PathVariable Long teamId, @RequestBody TeamRequest request) {
        return ResponseEntity.ok(teamService.updateTeam(teamId, request));
    }

    @DeleteMapping("/{teamId}")
    public ResponseEntity<Void> delete(@PathVariable Long teamId) {
        teamService.deleteTeam(teamId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{teamId}/members")
    public ResponseEntity<List<TeamMemberResponse>> members(@PathVariable Long teamId) {
        return ResponseEntity.ok(teamService.getMembers(teamId));
    }

    @PostMapping("/{teamId}/members/invite")
    public ResponseEntity<Map<String, String>> invite(
            @PathVariable Long teamId,
            @RequestBody TeamInviteRequest request
    ) {
        return ResponseEntity.ok(Map.of("message", teamService.inviteMember(teamId, request)));
    }

    @DeleteMapping("/{teamId}/members/{memberId}")
    public ResponseEntity<Void> removeMember(@PathVariable Long teamId, @PathVariable Long memberId) {
        teamService.removeMember(teamId, memberId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/invitations")
    public ResponseEntity<List<TeamMemberResponse>> invitations() {
        return ResponseEntity.ok(teamService.getMyInvitations());
    }

    @PostMapping("/invitations/{memberId}/accept")
    public ResponseEntity<Void> accept(@PathVariable Long memberId) {
        teamService.acceptInvitation(memberId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/invitations/{memberId}/reject")
    public ResponseEntity<Void> reject(@PathVariable Long memberId) {
        teamService.rejectInvitation(memberId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{teamId}/node-options")
    public ResponseEntity<List<TeamNodeOptionResponse>> nodeOptions(@PathVariable Long teamId) {
        return ResponseEntity.ok(teamService.getNodeOptions(teamId));
    }

    @PutMapping("/{teamId}/nodes")
    public ResponseEntity<List<TeamNodeOptionResponse>> updateNodes(
            @PathVariable Long teamId,
            @RequestBody TeamNodeUpdateRequest request
    ) {
        return ResponseEntity.ok(teamService.updateTeamNodes(teamId, request));
    }
}
