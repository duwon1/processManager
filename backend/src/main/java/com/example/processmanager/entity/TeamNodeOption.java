package com.example.processmanager.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TeamNodeOption {
    private Long nodeId;
    private String nodeName;
    private String osType;
    private String status;
    private Boolean shared;
}
