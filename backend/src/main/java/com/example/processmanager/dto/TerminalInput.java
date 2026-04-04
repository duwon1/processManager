package com.example.processmanager.dto;

/**
 * 브라우저 → 서버 → 에이전트로 전달되는 터미널 입력 데이터입니다.
 * sessionId: 터미널 세션 식별자 (브라우저 탭별 고유)
 * nodeId: 대상 노드 ID
 * data: 사용자 키 입력 (문자열, 한 글자 또는 이스케이프 시퀀스)
 */
public record TerminalInput(
        String sessionId,
        Long nodeId,
        String data
) {}
