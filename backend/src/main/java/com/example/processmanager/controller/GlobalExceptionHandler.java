package com.example.processmanager.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.Locale;
import java.util.UUID;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProblemDetail> handleBadRequest(IllegalArgumentException e, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "BAD_REQUEST",
                safeClientMessage(e.getMessage(), "요청값이 올바르지 않습니다."), e, request);
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ProblemDetail> handleConflict(IllegalStateException e, HttpServletRequest request) {
        return respond(HttpStatus.CONFLICT, "REQUEST_CONFLICT",
                safeClientMessage(e.getMessage(), "요청을 처리할 수 없습니다."), e, request);
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<ProblemDetail> handleForbidden(SecurityException e, HttpServletRequest request) {
        return respond(HttpStatus.FORBIDDEN, "FORBIDDEN", "권한이 없습니다.", e, request);
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ProblemDetail> handleDataAccess(DataAccessException e, HttpServletRequest request) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "DATA_ACCESS_ERROR",
                "데이터 처리 중 문제가 발생했습니다.", e, request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handleUnexpected(Exception e, HttpServletRequest request) {
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "요청 처리 중 문제가 발생했습니다.", e, request);
    }

    private ResponseEntity<ProblemDetail> respond(
            HttpStatus status,
            String code,
            String detail,
            Exception e,
            HttpServletRequest request
    ) {
        String errorId = UUID.randomUUID().toString();
        if (status.is5xxServerError()) {
            log.error("api error: errorId={}, status={}", errorId, status.value(), e);
        } else {
            log.warn("api warning: errorId={}, status={}, message={}", errorId, status.value(), e.getMessage());
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(status.getReasonPhrase());
        problem.setType(URI.create("https://procmanager/errors/" + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("errorId", errorId);

        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
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

}
