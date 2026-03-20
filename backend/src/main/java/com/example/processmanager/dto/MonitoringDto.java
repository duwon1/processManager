package com.example.processmanager.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

@Getter
@Setter
@ToString
public class MonitoringDto {
    // 파이썬이 보내는 JSON의 Key 이름과 정확히 일치시킵니다.
    private int id;
    private String title;
    private String value;
}