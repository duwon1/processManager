package com.example.processmanager.service;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.DeletedNodesMapper;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class NodeService {
    // heartbeat가 이 시간 이상 끊기면 화면에서는 오프라인으로 간주합니다.
    private static final Duration NODE_OFFLINE_THRESHOLD = Duration.ofSeconds(15);
    // 삭제 명령을 보냈는데 ACK가 없는 구버전 에이전트는 이 시간 뒤 서버 목록에서 정리합니다.
    private static final Duration LEGACY_UNINSTALL_GRACE = Duration.ofSeconds(5);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final NodeMapper nodeMapper;
    private final UserMapper userMapper;
    private final ProcessCommandService processCommandService;
    private final DeletedNodesMapper deletedNodesMapper;

    public NodeService(NodeMapper nodeMapper, UserMapper userMapper,
                       ProcessCommandService processCommandService, DeletedNodesMapper deletedNodesMapper) {
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
        this.processCommandService = processCommandService;
        this.deletedNodesMapper = deletedNodesMapper;
    }

    // JWT에서 추출한 이메일로 현재 로그인한 사용자를 조회합니다.
    private User getCurrentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userMapper.findByEmail(email);
    }

    // 현재 사용자의 노드 목록을 반환합니다.
    public List<NodeResponse> getMyNodes() {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        return nodeMapper.findAccessibleByUserId(user.getId()).stream()
                .map(node -> {
                    boolean owner = node.getUserId().equals(user.getId());
                    return NodeResponse.from(node, resolveNodeStatus(node), owner ? "OWNER" : "TEAM", owner);
                })
                .collect(Collectors.toList());
    }

    // 신규/재설치 에이전트가 account_token으로 등록할 때 호출됩니다.
    // 등록 후에는 account_token 대신 노드 전용 agent_secret으로 재접속합니다.
    public AgentConnection registerAgent(Long userId, String agentId, String hostname, String osType) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalArgumentException("agent-id가 없어 노드 등록을 진행할 수 없습니다.");
        }

        Node existing = null;

        // agentId가 있으면 UUID 기반으로 조회 (이름이 바뀌어도 동일 노드 인식)
        existing = nodeMapper.findByAgentId(agentId);
        // agentId로 못 찾으면 hostname fallback (구버전 에이전트 호환)
        if (existing == null) {
            existing = nodeMapper.findByUserIdAndName(userId, hostname);
        } else if (!existing.getUserId().equals(userId)) {
            throw new SecurityException("다른 사용자에게 등록된 agent-id입니다.");
        }

        if (existing == null) {
            // 삭제 예약된 구버전 노드는 재접속해도 신규 노드로 되살리지 않고 언인스톨 재전송 대상으로만 둡니다.
            if (deletedNodesMapper.existsByUserIdAndHostname(userId, hostname)) {
                Node pendingNode = Node.builder()
                        .userId(userId)
                        .name(hostname)
                        .osType(osType)
                        .status("D")
                        .agentId(agentId)
                        .build();
                return new AgentConnection(pendingNode, null);
            }
            // 첫 연결: 신규 노드 자동 등록
            String issuedSecret = generateAgentSecret();
            Node newNode = Node.builder()
                    .userId(userId)
                    .name(hostname)
                    .osType(osType)
                    .agentId(agentId)
                    .agentSecretHash(hashAgentSecret(issuedSecret))
                    .build();
            nodeMapper.insert(newNode);
            Node createdNode = nodeMapper.findByAgentId(agentId);
            if (createdNode != null) {
                nodeMapper.updateHeartbeat(createdNode.getId());
            }
            return new AgentConnection(createdNode, issuedSecret);
        } else {
            // 삭제 대기 중인 노드는 heartbeat나 재연결로 다시 온라인 상태가 되지 않게 유지합니다.
            if ("D".equals(existing.getStatus())) {
                return new AgentConnection(existing, null);
            }
            // account_token으로 들어온 재설치/구버전 노드는 새 agent_secret을 발급해 이후 재접속을 분리합니다.
            String issuedSecret = generateAgentSecret();
            nodeMapper.updateAgentSecretHash(existing.getId(), hashAgentSecret(issuedSecret));
            // 재연결: 이름이 변경됐으면 업데이트
            if (!hostname.equals(existing.getName())) {
                nodeMapper.updateName(existing.getId(), hostname);
            }
            nodeMapper.updateStatus(existing.getId(), "Y");
            nodeMapper.updateHeartbeat(existing.getId());
            return new AgentConnection(nodeMapper.findById(existing.getId()), issuedSecret);
        }
    }

    // 등록 완료된 에이전트가 agent_id + agent_secret으로 재접속할 때 호출됩니다.
    public AgentConnection connectRegisteredAgent(String agentId, String agentSecret, String hostname, String osType) {
        if (agentId == null || agentId.isBlank() || agentSecret == null || agentSecret.isBlank()) {
            throw new IllegalArgumentException("agent-id와 agent-secret이 필요합니다.");
        }
        Node existing = nodeMapper.findByAgentId(agentId);
        if (existing == null || existing.getAgentSecretHash() == null || existing.getAgentSecretHash().isBlank()) {
            throw new SecurityException("등록되지 않은 노드입니다.");
        }
        if (!MessageDigest.isEqual(
                existing.getAgentSecretHash().getBytes(StandardCharsets.UTF_8),
                hashAgentSecret(agentSecret).getBytes(StandardCharsets.UTF_8))) {
            throw new SecurityException("유효하지 않은 agent-secret입니다.");
        }
        if ("D".equals(existing.getStatus())) {
            return new AgentConnection(existing, null);
        }
        if (!hostname.equals(existing.getName())) {
            nodeMapper.updateName(existing.getId(), hostname);
        }
        nodeMapper.updateStatus(existing.getId(), "Y");
        nodeMapper.updateHeartbeat(existing.getId());
        return new AgentConnection(nodeMapper.findById(existing.getId()), null);
    }

    // 노드를 삭제 대기로 전환합니다. 실제 DB 삭제는 에이전트 언인스톨 ACK 수신 후 수행합니다.
    public void deleteNode(Long nodeId) {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findAccessibleByUserIdAndNodeId(user.getId(), nodeId);
        if (node == null) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        // 이미 오프라인인 노드는 ACK를 받을 경로가 없으므로 서버 목록에서 즉시 제거합니다.
        if (!"Y".equals(resolveNodeStatus(node))) {
            deletedNodesMapper.insert(node.getUserId(), node.getName());
            completeUninstall(node.getUserId(), node.getId(), node.getName());
            return;
        }
        nodeMapper.markDeletePending(nodeId);
        // 재접속 시에도 자가 삭제 명령을 다시 받을 수 있도록 삭제 예약을 기록합니다.
        deletedNodesMapper.insert(node.getUserId(), node.getName());
        // 이미 온라인인 에이전트는 현재 구독 중인 명령 채널로 즉시 언인스톨 명령을 받습니다.
        processCommandService.requestUninstall(node.getName());
        // 구버전 에이전트가 ACK를 보내지 않는 경우에도 서버 목록이 무한 대기하지 않도록 짧은 유예 후 정리합니다.
        completeLegacyUninstallAfterGrace(node.getUserId(), nodeId, node.getName());
    }

    // 에이전트 CONNECT 시 호출됩니다.
    // deleted_nodes에 등록된 호스트명이면 삭제 대기 상태로 판단합니다.
    public boolean checkAndHandleUninstall(Long userId, String hostname) {
        if (!deletedNodesMapper.existsByUserIdAndHostname(userId, hostname)) {
            return false;
        }
        processCommandService.requestUninstall(hostname);
        return true;
    }

    // 에이전트가 명령 채널 구독을 마친 뒤 삭제 대기 명령을 재전송합니다.
    public void resendPendingUninstall(Long userId, String hostname) {
        if (userId != null && hostname != null
                && deletedNodesMapper.existsByUserIdAndHostname(userId, hostname)) {
            processCommandService.requestUninstall(hostname);
        }
    }

    // 에이전트가 언인스톨 ACK를 보냈을 때 노드와 삭제 예약 기록을 최종 정리합니다.
    public void completeUninstall(Long userId, Long nodeId, String hostname) {
        if (userId == null || hostname == null || hostname.isBlank()) {
            return;
        }
        // ACK를 받은 시점부터 화면에서 노드를 제거합니다. nodeId가 없는 구버전 예약은 기록만 정리합니다.
        if (nodeId != null) {
            Node node = nodeMapper.findById(nodeId);
            if (node != null && node.getUserId().equals(userId) && "D".equals(node.getStatus())) {
                nodeMapper.deleteById(nodeId);
            }
        }
        deletedNodesMapper.deleteByUserIdAndHostname(userId, hostname);
    }

    // 구버전 에이전트는 ACK 없이 연결이 끊길 수 있어 삭제 대기 노드의 DISCONNECT를 완료 신호로 처리합니다.
    public boolean completeUninstallOnDisconnect(Long userId, Long nodeId, String hostname) {
        if (userId == null || nodeId == null || hostname == null || hostname.isBlank()) {
            return false;
        }
        Node node = nodeMapper.findById(nodeId);
        if (node == null || !node.getUserId().equals(userId) || !"D".equals(node.getStatus())) {
            return false;
        }
        completeUninstall(userId, nodeId, hostname);
        return true;
    }

    // ACK를 보내지 않는 구버전 에이전트를 위해 짧은 유예 시간 뒤 삭제 대기를 정리합니다.
    public void completeLegacyUninstallAfterGrace(Long userId, Long nodeId, String hostname) {
        Thread.startVirtualThread(() -> {
            try {
                Thread.sleep(LEGACY_UNINSTALL_GRACE.toMillis());
                completeUninstallOnDisconnect(userId, nodeId, hostname);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

    // 노드 업데이트 명령을 전송합니다. 현재 사용자 소유 노드인지 검증합니다.
    public void requestNodeUpdate(Long nodeId) {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findAccessibleByUserIdAndNodeId(user.getId(), nodeId);
        if (node == null) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        nodeMapper.markUpdateInProgress(node.getId());
        processCommandService.requestUpdate(node.getId(), node.getAgentId(), node.getName());
    }

    // 에이전트가 업데이트 가능 알림을 보내면 DB에 대기 상태로 등록합니다.
    public void markUpdateAvailable(Long nodeId, String currentSha, String latestSha) {
        if (nodeId != null) {
            nodeMapper.markUpdateAvailable(nodeId, currentSha, latestSha);
        }
    }

    // 에이전트가 업데이트 명령 수신 또는 재연결 결과를 보고하면 상태를 갱신합니다.
    public void handleUpdateResult(Long nodeId, boolean success, String stage,
                                   String currentSha, String latestSha, String message) {
        if (nodeId == null) {
            return;
        }
        Node node = nodeMapper.findById(nodeId);
        if (node == null) {
            return;
        }

        if ("started".equals(stage)) {
            nodeMapper.markUpdateInProgress(nodeId);
            return;
        }

        // 업데이트 후 재연결된 에이전트가 요청 당시 최신 커밋까지 도달했으면 알림을 제거합니다.
        if (isLatestRevision(node, currentSha, latestSha)) {
            nodeMapper.clearUpdateStatus(nodeId);
            return;
        }

        // 실제 업데이트 중이던 노드가 여전히 뒤처져 있으면 실패 상태로 남겨 재시도할 수 있게 합니다.
        if ("UPDATING".equals(node.getUpdateStatus())) {
            String failureMessage = message != null && !message.isBlank()
                    ? message
                    : "업데이트 후 최신 커밋 확인 실패";
            nodeMapper.markUpdateFailed(nodeId, failureMessage);
        }
    }

    // 현재 사용자가 소유한 노드 중 업데이트 대기/진행/실패 상태인 목록을 반환합니다.
    public List<Map<String, Object>> getPendingUpdates() {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        return nodeMapper.findAccessibleByUserId(user.getId()).stream()
                .filter(this::hasVisibleUpdateStatus)
                .map(node -> {
                    return Map.<String, Object>of(
                            "nodeId", node.getId(),
                            "nodeName", node.getName(),
                            "agentId", node.getAgentId() == null ? "" : node.getAgentId(),
                            "status", node.getUpdateStatus() == null ? "PENDING" : node.getUpdateStatus(),
                            "currentSha", node.getUpdateCurrentSha() == null ? "" : node.getUpdateCurrentSha(),
                            "latestSha", node.getUpdateLatestSha() == null ? "" : node.getUpdateLatestSha(),
                            "message", node.getUpdateMessage() == null ? "" : node.getUpdateMessage()
                    );
                })
                .collect(Collectors.toList());
    }

    // 현재 사용자가 소유한 업데이트 대기 노드 전체에 업데이트 명령을 전송합니다.
    public void requestAllUpdates() {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        nodeMapper.findAccessibleByUserId(user.getId()).stream()
                .filter(this::hasVisibleUpdateStatus)
                .filter(node -> !"UPDATING".equals(node.getUpdateStatus()))
                .forEach(node -> {
                    nodeMapper.markUpdateInProgress(node.getId());
                    processCommandService.requestUpdate(node.getId(), node.getAgentId(), node.getName());
                });
    }

    private boolean hasVisibleUpdateStatus(Node node) {
        String updateStatus = node.getUpdateStatus();
        return "PENDING".equals(updateStatus) || "UPDATING".equals(updateStatus) || "FAILED".equals(updateStatus);
    }

    private boolean isLatestRevision(Node node, String currentSha, String latestSha) {
        String current = currentSha == null ? "" : currentSha.trim();
        String latest = latestSha == null ? "" : latestSha.trim();
        String expectedLatest = node.getUpdateLatestSha() == null ? "" : node.getUpdateLatestSha().trim();

        // 에이전트가 현재 원격 최신 커밋과 같다고 보고하면, 알림 생성 당시 SHA보다 더 최신이어도 완료로 봅니다.
        if (!current.isBlank() && current.equals(latest)) {
            return true;
        }

        // 저장된 최신 SHA가 있으면 최소한 해당 커밋까지 도달했는지 확인합니다.
        if (!expectedLatest.isBlank()) {
            return !current.isBlank() && current.equals(expectedLatest);
        }
        return false;
    }

    // 에이전트 연결 해제 시 호출됩니다. 상태를 오프라인으로 변경합니다.
    public void disconnectAgent(Long nodeId) {
        nodeMapper.updateStatus(nodeId, "N");
    }

    // 에이전트 메시지가 도착할 때마다 heartbeat를 갱신해 상태가 stale되지 않게 유지합니다.
    public void touchNode(Long nodeId) {
        if (nodeId != null) {
            nodeMapper.updateHeartbeat(nodeId);
        }
    }

    // 이메일로 사용자를 조회하고, 해당 사용자가 소유한 온라인 노드인지 검증한 후 노드 이름을 반환합니다.
    // 유효하지 않으면 SecurityException 또는 IllegalStateException을 던집니다.
    public String validateNodeAndGetName(Long nodeId, String email) {
        User user = userMapper.findByEmail(email);
        if (user == null) throw new SecurityException("사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findAccessibleByUserIdAndNodeId(user.getId(), nodeId);
        if (node == null) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        if (!"Y".equals(resolveNodeStatus(node))) {
            throw new IllegalStateException("노드가 현재 연결되어 있지 않습니다.");
        }
        return node.getName();
    }

    // 이메일로 사용자를 조회하고, 해당 사용자가 소유한 노드인지 검증한 후 kill 명령을 에이전트로 전송합니다.
    public void killProcess(Long nodeId, int pid, String email) {
        User user = userMapper.findByEmail(email);
        if (user == null) throw new SecurityException("사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findAccessibleByUserIdAndNodeId(user.getId(), nodeId);
        if (node == null) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        if (!"Y".equals(resolveNodeStatus(node))) {
            throw new IllegalStateException("노드가 현재 연결되어 있지 않아 프로세스를 종료할 수 없습니다.");
        }
        processCommandService.requestKill(node.getId(), node.getName(), pid);
    }

    // 마지막 heartbeat 시각을 기준으로 현재 화면에 보여줄 상태를 계산합니다.
    private String resolveNodeStatus(Node node) {
        if ("D".equals(node.getStatus())) {
            return "D";
        }
        if (!"Y".equals(node.getStatus())) {
            return "N";
        }
        if (node.getLastSeen() == null) {
            return "N";
        }
        return node.getLastSeen().isBefore(LocalDateTime.now().minus(NODE_OFFLINE_THRESHOLD)) ? "N" : "Y";
    }

    // 노드별 고유 secret 원문을 생성합니다. DB에는 원문 대신 SHA-256 해시만 저장합니다.
    private String generateAgentSecret() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder("as_");
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    // 고엔트로피 secret 비교용 단방향 해시를 생성합니다.
    private String hashAgentSecret(String agentSecret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(agentSecret.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("agent secret 해시 생성 실패", e);
        }
    }

    // WebSocket 인증 결과와 신규 발급 secret을 함께 전달합니다.
    public record AgentConnection(Node node, String issuedAgentSecret) {
    }
}
