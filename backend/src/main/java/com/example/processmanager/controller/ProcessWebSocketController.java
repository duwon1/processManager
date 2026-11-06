package com.example.processmanager.controller;

import com.example.processmanager.config.WebSocketAuthInterceptor;
import com.example.processmanager.dto.ProcessKillResult;
import com.example.processmanager.service.NodeService;
import com.example.processmanager.service.ProcessCommandService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

import static com.example.processmanager.controller.WebSocketDestinations.nodeTopic;
import static com.example.processmanager.controller.WebSocketDestinations.safeClientMessage;

@Controller
public class ProcessWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(ProcessWebSocketController.class);

    // startedAt은 에이전트로 그대로 전달하는 문자열이라 과도한 길이만 막습니다.
    private static final int MAX_STARTED_AT_LENGTH = 64;

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final NodeService nodeService;
    private final ProcessCommandService processCommandService;
    private final SimpMessagingTemplate messagingTemplate;

    public ProcessWebSocketController(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            NodeService nodeService,
            ProcessCommandService processCommandService,
            SimpMessagingTemplate messagingTemplate
    ) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.nodeService = nodeService;
        this.processCommandService = processCommandService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/node.kill")
    public void handleBrowserKillRequest(
            @Payload Map<String, Object> payload,
            SimpMessageHeaderAccessor headerAccessor
    ) {
        Map<String, Object> attrs = headerAccessor.getSessionAttributes();
        String email = attrs != null ? (String) attrs.get("userEmail") : null;
        Object rawNodeId = payload.get("nodeId");
        Object rawPid = payload.get("pid");
        if (!(rawNodeId instanceof Number) || !(rawPid instanceof Number) || email == null) {
            return;
        }

        Long nodeId = ((Number) rawNodeId).longValue();
        int pid = ((Number) rawPid).intValue();
        if (nodeId <= 0 || pid <= 0) {
            return;
        }
        // 계약: {nodeId, pid, startedAt(문자열|null), requestId(UUID 문자열|생략)}
        String requestId = ProcessCommandService.resolveRequestId(payload.get("requestId"));
        String startedAt = payload.get("startedAt") instanceof String value
                && !value.isBlank() && value.length() <= MAX_STARTED_AT_LENGTH ? value : null;

        try {
            nodeService.killProcess(nodeId, pid, startedAt, requestId, email);
        } catch (SecurityException e) {
            // 권한 없는 요청은 노드 topic에 아무것도 보내지 않습니다. (남의 노드 구독자에게 결과 위조 방지)
            log.warn("kill 요청 권한 없음: nodeId={}, error={}", nodeId, e.getMessage());
        } catch (IllegalStateException | IllegalArgumentException e) {
            messagingTemplate.convertAndSend(nodeTopic(nodeId, "process-kill-result"),
                    new ProcessKillResult(requestId, pid, false, safeClientMessage(e), nodeId, null));
        }
    }

    @MessageMapping("/process/kill-result")
    public void handleKillResult(
            ProcessKillResult payload,
            @Header("simpSessionId") String sessionId
    ) {
        WebSocketAuthInterceptor.NodeSessionInfo nodeInfo = webSocketAuthInterceptor.getNodeSessionInfo(sessionId);
        if (nodeInfo == null || nodeInfo.nodeId() == null) {
            return;
        }
        nodeService.touchNode(nodeInfo.nodeId());

        processCommandService.completeKillResult(
                payload.requestId(), payload.pid(), payload.success(), payload.message(), nodeInfo.nodeId(), nodeInfo.nodeName()
        );
    }
}
