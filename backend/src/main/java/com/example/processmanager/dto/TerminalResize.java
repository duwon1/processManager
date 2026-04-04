package com.example.processmanager.dto;

/**
 * 브라우저 → 에이전트로 전달되는 터미널 크기 변경 이벤트입니다.
 * PTY의 행/열 크기를 동기화해 vim 등이 올바르게 동작하도록 합니다.
 */
public record TerminalResize(
        String sessionId,
        Long nodeId,
        int cols,
        int rows
) {}
