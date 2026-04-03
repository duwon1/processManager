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
    private String host;
    private String osType;
    private String status;
    private LocalDateTime lastSeen;
    private LocalDateTime createdAt;

    // Node 엔티티를 응답 DTO로 변환합니다.
    public static NodeResponse from(Node node) {
        return from(node, node.getStatus());
    }

    // 상태 보정이 필요한 경우 표시용 상태를 따로 주입합니다.
    public static NodeResponse from(Node node, String status) {
        return NodeResponse.builder()
                .id(node.getId())
                .name(node.getName())
                .host(node.getHost())
                .osType(node.getOsType())
                .status(status)
                .lastSeen(node.getLastSeen())
                .createdAt(node.getCreatedAt())
                .build();
    }
}
