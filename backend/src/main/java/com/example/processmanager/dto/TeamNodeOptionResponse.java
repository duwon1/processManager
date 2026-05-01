package com.example.processmanager.dto;

import com.example.processmanager.entity.TeamNodeOption;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TeamNodeOptionResponse {
    private Long nodeId;
    private String nodeName;
    private String osType;
    private String status;
    private Boolean shared;

    public static TeamNodeOptionResponse from(TeamNodeOption option) {
        return TeamNodeOptionResponse.builder()
                .nodeId(option.getNodeId())
                .nodeName(option.getNodeName())
                .osType(option.getOsType())
                .status(option.getStatus())
                .shared(Boolean.TRUE.equals(option.getShared()))
                .build();
    }
}
