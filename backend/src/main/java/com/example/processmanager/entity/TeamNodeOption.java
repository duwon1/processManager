package com.example.processmanager.entity;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TeamNodeOption {
    private Long nodeId;
    private String nodeName;
    private String osType;
    private String status;
    private Boolean shared;
}
