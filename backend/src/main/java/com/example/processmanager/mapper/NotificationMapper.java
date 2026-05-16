package com.example.processmanager.mapper;

import com.example.processmanager.entity.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface NotificationMapper {
    void insert(Notification notification);

    Notification findById(Long id);

    Notification findByUserIdAndDedupeKey(@Param("userId") Long userId, @Param("dedupeKey") String dedupeKey);

    List<Notification> findByUserId(@Param("userId") Long userId, @Param("limit") int limit);

    int countUnreadByUserId(Long userId);

    int updateExisting(Notification notification);

    int markRead(@Param("id") Long id, @Param("userId") Long userId);

    int markAllRead(Long userId);
}
