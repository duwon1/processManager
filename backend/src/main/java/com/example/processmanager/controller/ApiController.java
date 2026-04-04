package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.dto.TerminalInput;
import com.example.processmanager.dto.TerminalOutput;
import com.example.processmanager.dto.TerminalResize;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import com.example.processmanager.service.TerminalService;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Controller
public class ApiController {

    private static final Logger log = LoggerFactory.getLogger(ApiController.class);
    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final ProcessCommandService processCommandService;
    private final TerminalService terminalService;
    private final SimpMessagingTemplate messagingTemplate;

    public ApiController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            ProcessCommandService processCommandService,
            TerminalService terminalService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.processCommandService = processCommandService;
        this.terminalService = terminalService;
        this.messagingTemplate = messagingTemplate;
    }

    // 에이전트가 보낸 실시간 모니터링 데이터를 웹 클라이언트 구독 채널로 다시 전달합니다.
    @MessageMapping("/monitoring")
    @SendTo("/topic/monitoring")
    public List<Map<String, Object>> broadcastMetrics(
            List<Map<String, Object>> metrics,
            @Header("simpSessionId") String sessionId
    ) {
        // 모니터링 메시지가 도착하면 heartbeat를 갱신해 온라인 상태를 유지합니다.
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }
        log.debug("에이전트로부터 수신한 실시간 데이터: {}", metrics);
        return metrics;
    }

    // 에이전트가 보낸 프로세스 목록을 웹 클라이언트 구독 채널로 다시 전달합니다.
    @MessageMapping("/process")
    @SendTo("/topic/process")
    public Map<String, Object> broadcastProcesses(
            List<Map<String, Object>> processes,
            @Header("simpSessionId") String sessionId
    ) {
        // WebSocket 세션에 연결된 노드 정보를 함께 담아 프론트가 노드별로 분기할 수 있게 합니다.
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("nodeId", nodeInfo != null ? nodeInfo.nodeId() : null);
        payload.put("nodeName", nodeInfo != null ? nodeInfo.nodeName() : null);
        payload.put("updatedAt", Instant.now().toString());
        payload.put("processes", processes);

        log.debug("에이전트로부터 수신한 프로세스 데이터: {}건", processes.size());
        return payload;
    }

    // 브라우저가 STOMP로 보낸 프로세스 종료 요청을 처리합니다.
    // 세션에 저장된 이메일로 사용자를 인증하고, 에이전트로 kill 명령을 전송합니다.
    @MessageMapping("/node.kill")
    public void handleBrowserKillRequest(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;

        // nodeId, pid가 누락되거나 잘못된 타입이면 에러를 반환합니다.
        Object rawNodeId = payload.get("nodeId");
        Object rawPid    = payload.get("pid");
        if (!(rawNodeId instanceof Number) || !(rawPid instanceof Number)) {
            messagingTemplate.convertAndSend("/topic/process-kill-result",
                    new ProcessKillResult("", 0, false, "잘못된 요청입니다. (nodeId/pid 누락)", null, null));
            return;
        }
        Long nodeId = ((Number) rawNodeId).longValue();
        int pid     = ((Number) rawPid).intValue();

        if (email == null) {
            messagingTemplate.convertAndSend("/topic/process-kill-result",
                    new ProcessKillResult("", pid, false, "인증되지 않은 사용자입니다.", nodeId, null));
            return;
        }

        try {
            nodeService.killProcess(nodeId, pid, email);
        } catch (SecurityException | IllegalStateException e) {
            messagingTemplate.convertAndSend("/topic/process-kill-result",
                    new ProcessKillResult("", pid, false, e.getMessage(), nodeId, null));
        }
    }

    // 에이전트가 종료 처리 후 보낸 결과를 브라우저로 전달합니다.
    @MessageMapping("/process/kill-result")
    public void handleKillResult(
            ProcessKillResult payload,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        Long nodeId = nodeInfo != null ? nodeInfo.nodeId() : payload.nodeId();
        String nodeName = nodeInfo != null ? nodeInfo.nodeName() : payload.nodeName();
        processCommandService.completeKillResult(
                payload.requestId(), payload.pid(), payload.success(), payload.message(), nodeId, nodeName
        );
    }

    // ── 터미널 관련 핸들러 ──

    // 브라우저가 터미널 세션 시작을 요청합니다.
    @MessageMapping("/terminal.open")
    public void handleTerminalOpen(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        if (email == null) {
            log.warn("터미널 열기 실패: 인증되지 않은 사용자");
            return;
        }

        String termSessionId = (String) payload.get("sessionId");
        Object rawNodeId = payload.get("nodeId");
        int cols = payload.get("cols") != null ? ((Number) payload.get("cols")).intValue() : 80;
        int rows = payload.get("rows") != null ? ((Number) payload.get("rows")).intValue() : 24;

        if (termSessionId == null || !(rawNodeId instanceof Number)) {
            log.warn("터미널 열기 실패: 필수 파라미터 누락");
            return;
        }

        Long nodeId = ((Number) rawNodeId).longValue();
        log.info("터미널 세션 열기: email={}, nodeId={}, sessionId={}", email, nodeId, termSessionId);
        terminalService.openSession(termSessionId, nodeId, cols, rows);
    }

    // 브라우저의 키 입력을 에이전트로 중계합니다.
    @MessageMapping("/terminal.input")
    public void handleTerminalInput(@Payload TerminalInput input) {
        terminalService.sendInput(input);
    }

    // 에이전트의 PTY 출력을 브라우저로 중계합니다.
    @MessageMapping("/terminal.output")
    public void handleTerminalOutput(
            @Payload TerminalOutput output,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }
        terminalService.sendOutput(output);
    }

    // 브라우저의 터미널 크기 변경을 에이전트로 중계합니다.
    @MessageMapping("/terminal.resize")
    public void handleTerminalResize(@Payload TerminalResize resize) {
        terminalService.sendResize(resize);
    }

    // 브라우저가 터미널 세션 종료를 요청합니다.
    @MessageMapping("/terminal.close")
    public void handleTerminalClose(@Payload Map<String, Object> payload) {
        String termSessionId = (String) payload.get("sessionId");
        if (termSessionId != null) {
            terminalService.closeSession(termSessionId);
        }
    }
}
