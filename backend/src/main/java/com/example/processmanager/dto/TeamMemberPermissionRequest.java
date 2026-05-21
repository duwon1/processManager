package com.example.processmanager.dto;

public record TeamMemberPermissionRequest(
        Boolean canViewMonitoring,
        Boolean canUseTerminal,
        Boolean canControlProcesses,
        Boolean canControlServices
) {
}
