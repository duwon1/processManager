package com.example.processmanager.mapper;

import com.example.processmanager.entity.NotificationRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface NotificationRuleMapper {
    void insert(NotificationRule rule);

    NotificationRule findById(Long id);

    List<NotificationRule> findByUserId(Long userId);

    List<NotificationRule> findEnabledForNode(@Param("ownerUserId") Long ownerUserId, @Param("nodeId") Long nodeId);

    int update(NotificationRule rule);

    int deleteByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);

    int updateFirstMatchedAt(@Param("id") Long id, @Param("firstMatchedAt") LocalDateTime firstMatchedAt);

    int clearFirstMatchedAt(Long id);

    int markTriggered(@Param("id") Long id, @Param("lastTriggeredAt") LocalDateTime lastTriggeredAt);
}
