package com.example.processmanager.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class MonitoringDto {
    private String hostname;
    private CpuInfo cpu;
    private MemoryInfo memory;
    private DiskInfo disk;
    private NetworkInfo network;

    @Getter @Setter @ToString
    public static class CpuInfo {
        private double usage_percent;
    }

    @Getter @Setter @ToString
    public static class MemoryInfo {
        private long total_bytes;
        private long used_bytes;
        private double usage_percent;
    }

    @Getter @Setter @ToString
    public static class DiskInfo {
        private long total_bytes;
        private long used_bytes;
        private double usage_percent;
    }

    @Getter @Setter @ToString
    public static class NetworkInfo {
        private long bytes_sent;
        private long bytes_recv;
    }
}
