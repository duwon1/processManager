package com.example.processmanager.mapper;

import com.example.processmanager.entity.AgentInstallToken;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface AgentInstallTokenMapper {
    void insert(AgentInstallToken token);

    int revokeUnusedForUser(@Param("userId") Long userId,
                            @Param("now") LocalDateTime now);

    AgentInstallToken findActiveByTokenHash(@Param("tokenHash") String tokenHash,
                                            @Param("now") LocalDateTime now);

    AgentInstallToken findClaimedByTokenHashAndAgentId(@Param("tokenHash") String tokenHash,
                                                       @Param("agentId") String agentId,
                                                       @Param("claimCutoff") LocalDateTime claimCutoff);

    int claim(@Param("id") Long id,
              @Param("agentId") String agentId,
              @Param("now") LocalDateTime now);

    int extend(@Param("id") Long id,
               @Param("expiresAt") LocalDateTime expiresAt,
               @Param("now") LocalDateTime now,
               @Param("maxExtensions") int maxExtensions);

    int markUsed(@Param("id") Long id,
                 @Param("agentId") String agentId,
                 @Param("now") LocalDateTime now);

    int deleteExpiredBefore(@Param("cutoff") LocalDateTime cutoff);
}
