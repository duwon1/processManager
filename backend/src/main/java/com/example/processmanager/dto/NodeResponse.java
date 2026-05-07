package com.example.processmanager.dto;

import com.example.processmanager.entity.Node;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Builder
public class NodeResponse {
    private Long id;
    private String name;
    private String osType;
    private String status;
    private LocalDateTime lastSeen;
    private LocalDateTime createdAt;
    private String accessSource;
    private Boolean owner;
    private Boolean canViewMonitoring;
    private Boolean canViewFiles;
    private Boolean canUseTerminal;
    private Boolean canControlProcesses;
    private Boolean canControlServices;

    public static NodeResponse from(Node node) {
        return from(node, node.getStatus());
    }

    public static NodeResponse from(Node node, String status) {
        return from(node, status, "OWNER", true);
    }

    public static NodeResponse from(Node node, String status, String accessSource, boolean owner) {
        return NodeResponse.builder()
                .id(node.getId())
                .name(node.getName())
                .osType(node.getOsType())
                .status(status)
                .lastSeen(node.getLastSeen())
                .createdAt(node.getCreatedAt())
                .accessSource(accessSource)
                .owner(owner)
                .canViewMonitoring(enabledForOwner(owner, node.getCanViewMonitoring()))
                .canViewFiles(enabledForOwner(owner, node.getCanViewFiles()))
                .canUseTerminal(enabledForOwner(owner, node.getCanUseTerminal()))
                .canControlProcesses(enabledForOwner(owner, node.getCanControlProcesses()))
                .canControlServices(enabledForOwner(owner, node.getCanControlServices()))
                .build();
    }

    private static boolean enabledForOwner(boolean owner, Boolean value) {
        return owner || Boolean.TRUE.equals(value);
    }
}
