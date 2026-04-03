package com.example.processmanager.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class NodeRegisterRequest {
    private String name;   // PC 별칭 (예: "웹서버1")
    private String host;   // IP 주소 (예: 192.168.0.10)
    private int port;      // 에이전트 포트 (예: 8081)
    private String osType; // 운영체제 (Linux / Windows)
}
