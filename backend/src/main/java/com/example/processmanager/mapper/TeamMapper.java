package com.example.processmanager.mapper;

import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.Team;
import com.example.processmanager.entity.TeamMember;
import com.example.processmanager.entity.TeamNodeOption;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TeamMapper {
    void insertTeam(Team team);

    void insertOwnerMember(@Param("teamId") Long teamId, @Param("userId") Long userId);

    Team findById(Long id);

    Team findByOwnerUserIdAndName(@Param("ownerUserId") Long ownerUserId, @Param("name") String name);

    List<Team> findTeamsByUserId(Long userId);

    void updateTeam(Team team);

    int deleteTeamByIdAndOwnerUserId(@Param("id") Long id, @Param("ownerUserId") Long ownerUserId);

    TeamMember findMemberByTeamIdAndUserId(@Param("teamId") Long teamId, @Param("userId") Long userId);

    TeamMember findMemberById(Long id);

    List<TeamMember> findMembersByTeamId(Long teamId);

    List<TeamMember> findInvitationsByUserId(Long userId);

    void insertInvite(@Param("teamId") Long teamId,
                      @Param("userId") Long userId,
                      @Param("invitedByUserId") Long invitedByUserId);

    void reactivateInvite(@Param("id") Long id, @Param("invitedByUserId") Long invitedByUserId);

    int acceptInvitation(@Param("id") Long id, @Param("userId") Long userId);

    int rejectInvitation(@Param("id") Long id, @Param("userId") Long userId);

    int cancelInvitation(@Param("id") Long id, @Param("teamId") Long teamId);

    int removeMember(@Param("id") Long id, @Param("teamId") Long teamId);

    List<TeamNodeOption> findNodeOptions(@Param("teamId") Long teamId, @Param("ownerUserId") Long ownerUserId);

    List<Node> findTeamNodes(Long teamId);

    List<Long> findOwnedNodeIds(@Param("ownerUserId") Long ownerUserId, @Param("nodeIds") List<Long> nodeIds);

    void deleteTeamNodes(Long teamId);

    void insertTeamNode(@Param("teamId") Long teamId,
                        @Param("nodeId") Long nodeId,
                        @Param("grantedByUserId") Long grantedByUserId);
}
