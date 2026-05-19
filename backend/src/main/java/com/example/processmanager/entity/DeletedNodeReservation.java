package com.example.processmanager.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeletedNodeReservation {
    private Long userId;
    private String hostname;
    private String agentId;
    private String agentSecretHash;
}
