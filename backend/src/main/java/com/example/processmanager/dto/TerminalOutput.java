package com.example.processmanager.dto;

/**
 * 에이전트 → 서버 → 브라우저로 전달되는 터미널 출력 데이터입니다.
 * sessionId: 터미널 세션 식별자
 * nodeId: 출력을 보낸 노드 ID
 * data: PTY 출력 (ANSI 이스케이프 코드 포함 가능)
 */
public record TerminalOutput(
        String sessionId,
        Long nodeId,
        String data
) {}
