package com.example.processmanager.service;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.DeletedNodesMapper;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class NodeService {
    // heartbeat가 이 시간 이상 끊기면 화면에서는 오프라인으로 간주합니다.
    private static final Duration NODE_OFFLINE_THRESHOLD = Duration.ofSeconds(15);

    // 업데이트 대기 중인 노드를 추적합니다. nodeId → [currentSha, latestSha]
    private final ConcurrentHashMap<Long, String[]> pendingUpdates = new ConcurrentHashMap<>();

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
        return nodeMapper.findByUserId(user.getId()).stream()
                .map(node -> NodeResponse.from(node, resolveNodeStatus(node)))
                .collect(Collectors.toList());
    }

    // 에이전트 연결 시 호출됩니다.
    // agentId로 먼저 조회하고 없으면 hostname으로 fallback합니다.
    // 기존 노드면 이름/상태 갱신, 신규면 자동 등록합니다.
    public Node connectAgent(Long userId, String agentId, String hostname, String osType) {
        Node existing = null;

        // agentId가 있으면 UUID 기반으로 조회 (이름이 바뀌어도 동일 노드 인식)
        if (agentId != null && !agentId.isBlank()) {
            existing = nodeMapper.findByAgentId(agentId);
        }
        // agentId로 못 찾으면 hostname fallback (구버전 에이전트 호환)
        if (existing == null) {
            existing = nodeMapper.findByUserIdAndName(userId, hostname);
        }

        if (existing == null) {
            // 첫 연결: 신규 노드 자동 등록
            Node newNode = Node.builder()
                    .userId(userId)
                    .name(hostname)
                    .osType(osType)
                    .agentId(agentId)
                    .build();
            nodeMapper.insert(newNode);
            Node createdNode = (agentId != null && !agentId.isBlank())
                    ? nodeMapper.findByAgentId(agentId)
                    : nodeMapper.findByUserIdAndName(userId, hostname);
            if (createdNode != null) {
                nodeMapper.updateHeartbeat(createdNode.getId());
            }
            return createdNode;
        } else {
            // 재연결: 이름이 변경됐으면 업데이트
            if (!hostname.equals(existing.getName())) {
                nodeMapper.updateName(existing.getId(), hostname);
            }
            nodeMapper.updateStatus(existing.getId(), "Y");
            nodeMapper.updateHeartbeat(existing.getId());
            return nodeMapper.findById(existing.getId());
        }
    }

    // 노드를 삭제합니다. 현재 사용자 소유 노드인지 검증하고, deleted_nodes에 기록합니다.
    public void deleteNode(Long nodeId) {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findById(nodeId);
        if (node == null || !node.getUserId().equals(user.getId())) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        nodeMapper.deleteById(nodeId);
        // 에이전트가 재접속 시 자가 삭제 명령을 받을 수 있도록 기록합니다.
        deletedNodesMapper.insert(user.getId(), node.getName());
    }

    // 에이전트 CONNECT 시 호출됩니다.
    // deleted_nodes에 등록된 호스트명이면 언인스톨 명령을 전송하고 true를 반환합니다.
    public boolean checkAndHandleUninstall(Long userId, String hostname) {
        if (!deletedNodesMapper.existsByUserIdAndHostname(userId, hostname)) {
            return false;
        }
        processCommandService.requestUninstall(hostname);
        deletedNodesMapper.deleteByUserIdAndHostname(userId, hostname);
        return true;
    }

    // 노드 업데이트 명령을 전송합니다. 현재 사용자 소유 노드인지 검증합니다.
    public void requestNodeUpdate(Long nodeId) {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        Node node = nodeMapper.findById(nodeId);
        if (node == null || !node.getUserId().equals(user.getId())) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        processCommandService.requestUpdate(node.getName());
    }

    // 에이전트가 업데이트 가능 알림을 보내면 대기 목록에 등록합니다.
    public void markUpdateAvailable(Long nodeId, String currentSha, String latestSha) {
        if (nodeId != null) {
            pendingUpdates.put(nodeId, new String[]{currentSha, latestSha});
        }
    }

    // 업데이트 명령 전송 후 대기 목록에서 제거합니다.
    public void clearPendingUpdate(Long nodeId) {
        if (nodeId != null) {
            pendingUpdates.remove(nodeId);
        }
    }

    // 현재 사용자가 소유한 노드 중 업데이트 대기 중인 목록을 반환합니다.
    public List<Map<String, Object>> getPendingUpdates() {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        return nodeMapper.findByUserId(user.getId()).stream()
                .filter(node -> pendingUpdates.containsKey(node.getId()))
                .map(node -> {
                    String[] shas = pendingUpdates.get(node.getId());
                    return Map.<String, Object>of(
                            "nodeId", node.getId(),
                            "nodeName", node.getName(),
                            "currentSha", shas[0],
                            "latestSha", shas[1]
                    );
                })
                .collect(Collectors.toList());
    }

    // 현재 사용자가 소유한 업데이트 대기 노드 전체에 업데이트 명령을 전송합니다.
    public void requestAllUpdates() {
        User user = getCurrentUser();
        if (user == null) throw new IllegalStateException("인증된 사용자를 찾을 수 없습니다.");
        nodeMapper.findByUserId(user.getId()).stream()
                .filter(node -> pendingUpdates.containsKey(node.getId()))
                .forEach(node -> {
                    processCommandService.requestUpdate(node.getName());
                    pendingUpdates.remove(node.getId());
                });
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
        Node node = nodeMapper.findById(nodeId);
        if (node == null || !node.getUserId().equals(user.getId())) {
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
        Node node = nodeMapper.findById(nodeId);
        if (node == null || !node.getUserId().equals(user.getId())) {
            throw new SecurityException("접근 권한이 없는 노드입니다.");
        }
        if (!"Y".equals(resolveNodeStatus(node))) {
            throw new IllegalStateException("노드가 현재 연결되어 있지 않아 프로세스를 종료할 수 없습니다.");
        }
        processCommandService.requestKill(node.getId(), node.getName(), pid);
    }

    // 마지막 heartbeat 시각을 기준으로 현재 화면에 보여줄 상태를 계산합니다.
    private String resolveNodeStatus(Node node) {
        if (!"Y".equals(node.getStatus())) {
            return "N";
        }
        if (node.getLastSeen() == null) {
            return "N";
        }
        return node.getLastSeen().isBefore(LocalDateTime.now().minus(NODE_OFFLINE_THRESHOLD)) ? "N" : "Y";
    }
}
