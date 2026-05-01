package com.example.processmanager.service;

import com.example.processmanager.dto.TeamRequest;
import com.example.processmanager.dto.TeamResponse;
import com.example.processmanager.entity.Team;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.TeamMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class TeamService {

    private final TeamMapper teamMapper;
    private final UserMapper userMapper;

    public TeamService(TeamMapper teamMapper, UserMapper userMapper) {
        this.teamMapper = teamMapper;
        this.userMapper = userMapper;
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
        return teamMapper.findByUserId(user.getId()).stream()
                .map(TeamResponse::from)
                .collect(Collectors.toList());
    }

    public TeamResponse createTeam(TeamRequest request) {
        User user = getCurrentUser();
        String name = normalizeName(request.name());
        String description = normalizeDescription(request.description());

        if (teamMapper.findByUserIdAndName(user.getId(), name) != null) {
            throw new IllegalArgumentException("이미 같은 이름의 팀이 있습니다.");
        }

        Team team = Team.builder()
                .userId(user.getId())
                .name(name)
                .description(description)
                .build();
        teamMapper.insert(team);
        return TeamResponse.from(team);
    }

    public void deleteTeam(Long id) {
        User user = getCurrentUser();
        int deleted = teamMapper.deleteByIdAndUserId(id, user.getId());
        if (deleted == 0) {
            throw new SecurityException("접근 권한이 없는 팀입니다.");
        }
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
}
