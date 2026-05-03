package com.example.processmanager.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Locale;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleBadRequest(IllegalArgumentException e) {
        return respond(HttpStatus.BAD_REQUEST, safeClientMessage(e.getMessage(), "요청값이 올바르지 않습니다."), e);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiErrorResponse> handleConflict(IllegalStateException e) {
        return respond(HttpStatus.CONFLICT, safeClientMessage(e.getMessage(), "요청을 처리할 수 없습니다."), e);
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<ApiErrorResponse> handleForbidden(SecurityException e) {
        return respond(HttpStatus.FORBIDDEN, "권한이 없습니다.", e);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleDataAccess(DataAccessException e) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "데이터 처리 중 문제가 발생했습니다.", e);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception e) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "요청 처리 중 문제가 발생했습니다.", e);
    }

    private ResponseEntity<ApiErrorResponse> respond(HttpStatus status, String message, Exception e) {
        String errorId = UUID.randomUUID().toString();
        if (status.is5xxServerError()) {
            log.error("api error: errorId={}, status={}", errorId, status.value(), e);
        } else {
            log.warn("api warning: errorId={}, status={}, message={}", errorId, status.value(), e.getMessage());
        }
        return ResponseEntity.status(status).body(new ApiErrorResponse(message, errorId));
    }

    private String safeClientMessage(String message, String fallback) {
        if (message == null || message.isBlank() || message.length() > 120) {
            return fallback;
        }

        String lower = message.toLowerCase(Locale.ROOT);
        String[] blockedTerms = {
                "sql", "jdbc", "constraint", "column", "table", "select ", "insert ",
                "update ", "delete ", "exception", "preparedstatement", "java."
        };
        for (String term : blockedTerms) {
            if (lower.contains(term)) {
                return fallback;
            }
        }
        return message;
    }

    public record ApiErrorResponse(String message, String errorId) {
    }
}
