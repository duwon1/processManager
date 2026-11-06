package com.example.processmanager.service;

/**
 * nodes.status 컬럼 값입니다. DB에는 기존과 동일한 한 글자 코드를 그대로 저장합니다.
 */
public final class NodeStatus {

    // 에이전트 연결됨
    public static final String ONLINE = "Y";
    // 에이전트 연결 끊김
    public static final String OFFLINE = "N";
    // 삭제 대기 (에이전트 언인스톨 ACK 대기)
    public static final String DELETE_PENDING = "D";

    private NodeStatus() {
    }
}
