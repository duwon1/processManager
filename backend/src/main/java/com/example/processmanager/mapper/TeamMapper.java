package com.example.processmanager.mapper;

import com.example.processmanager.entity.Team;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TeamMapper {
    void insert(Team team);

    List<Team> findByUserId(Long userId);

    Team findByUserIdAndName(@Param("userId") Long userId, @Param("name") String name);

    int deleteByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
}
