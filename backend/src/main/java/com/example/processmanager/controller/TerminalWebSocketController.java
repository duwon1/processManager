package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.TerminalInput;
import com.example.processmanager.dto.TerminalOutput;
import com.example.processmanager.dto.TerminalResize;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.TerminalService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class TerminalWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(TerminalWebSocketController.class);

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final TerminalService terminalService;

    public TerminalWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            TerminalService terminalService
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.terminalService = terminalService;
    }

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
        try {
            NodeService.NodeCommandTarget target = nodeService.validateNodeAndGetTarget(nodeId, email);
            terminalService.openSession(
                    termSessionId, target.nodeId(), target.nodeName(), target.agentId(), email, cols, rows
            );
        } catch (Exception e) {
            log.warn("terminal open failed: nodeId={}, error={}", nodeId, e.getMessage());
        }
    }

    @MessageMapping("/terminal.input")
    public void handleTerminalInput(@Payload TerminalInput input, SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        if (email != null) {
            terminalService.sendInput(input, email);
        }
    }

    @MessageMapping("/terminal.output")
    public void handleTerminalOutput(
            @Payload TerminalOutput output,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo != null) {
            nodeService.touchNode(nodeInfo.nodeId());
        }

        TerminalOutput normalizedOutput = output;
        if (nodeInfo != null && nodeInfo.nodeId() != null
                && (output.nodeId() == null || !nodeInfo.nodeId().equals(output.nodeId()))) {
            normalizedOutput = new TerminalOutput(output.sessionId(), nodeInfo.nodeId(), output.data());
        }
        terminalService.sendOutput(normalizedOutput);
    }

    @MessageMapping("/terminal.resize")
    public void handleTerminalResize(@Payload TerminalResize resize, SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        if (email != null) {
            terminalService.sendResize(resize, email);
        }
    }

    @MessageMapping("/terminal.close")
    public void handleTerminalClose(@Payload Map<String, Object> payload, SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        String termSessionId = (String) payload.get("sessionId");
        if (termSessionId != null && email != null) {
            terminalService.closeSession(termSessionId, email);
        }
    }
}
