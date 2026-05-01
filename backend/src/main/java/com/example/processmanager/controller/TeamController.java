package com.example.processmanager.controller;

import com.example.processmanager.dto.TeamInviteRequest;
import com.example.processmanager.dto.TeamMemberResponse;
import com.example.processmanager.dto.TeamNodeOptionResponse;
import com.example.processmanager.dto.TeamNodeUpdateRequest;
import com.example.processmanager.dto.TeamRequest;
import com.example.processmanager.dto.TeamResponse;
import com.example.processmanager.service.TeamService;
import org.springframework.http.HttpStatus;
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
    public ResponseEntity<?> create(@RequestBody TeamRequest request) {
        try {
            return ResponseEntity.ok(teamService.createTeam(request));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        }
    }

    @PatchMapping("/{teamId}")
    public ResponseEntity<?> update(@PathVariable Long teamId, @RequestBody TeamRequest request) {
        try {
            return ResponseEntity.ok(teamService.updateTeam(teamId, request));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{teamId}")
    public ResponseEntity<?> delete(@PathVariable Long teamId) {
        try {
            teamService.deleteTeam(teamId);
            return ResponseEntity.ok().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/{teamId}/members")
    public ResponseEntity<?> members(@PathVariable Long teamId) {
        try {
            return ResponseEntity.ok(teamService.getMembers(teamId));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/{teamId}/members/invite")
    public ResponseEntity<?> invite(@PathVariable Long teamId, @RequestBody TeamInviteRequest request) {
        try {
            return ResponseEntity.ok(Map.of("message", teamService.inviteMember(teamId, request)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @DeleteMapping("/{teamId}/members/{memberId}")
    public ResponseEntity<?> removeMember(@PathVariable Long teamId, @PathVariable Long memberId) {
        try {
            teamService.removeMember(teamId, memberId);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", e.getMessage()));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/invitations")
    public ResponseEntity<List<TeamMemberResponse>> invitations() {
        return ResponseEntity.ok(teamService.getMyInvitations());
    }

    @PostMapping("/invitations/{memberId}/accept")
    public ResponseEntity<?> accept(@PathVariable Long memberId) {
        try {
            teamService.acceptInvitation(memberId);
            return ResponseEntity.ok().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/invitations/{memberId}/reject")
    public ResponseEntity<?> reject(@PathVariable Long memberId) {
        try {
            teamService.rejectInvitation(memberId);
            return ResponseEntity.ok().build();
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @GetMapping("/{teamId}/node-options")
    public ResponseEntity<?> nodeOptions(@PathVariable Long teamId) {
        try {
            return ResponseEntity.ok(teamService.getNodeOptions(teamId));
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }

    @PutMapping("/{teamId}/nodes")
    public ResponseEntity<?> updateNodes(@PathVariable Long teamId, @RequestBody TeamNodeUpdateRequest request) {
        try {
            List<TeamNodeOptionResponse> options = teamService.updateTeamNodes(teamId, request);
            return ResponseEntity.ok(options);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("message", e.getMessage()));
        }
    }
}
