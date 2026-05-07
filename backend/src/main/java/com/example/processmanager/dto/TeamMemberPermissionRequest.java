package com.example.processmanager.dto;

public record TeamMemberPermissionRequest(
        Boolean canViewMonitoring,
        Boolean canViewFiles,
        Boolean canUseTerminal,
        Boolean canControlProcesses,
        Boolean canControlServices
) {
}
