package com.example.processmanager.service;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.entity.Node;
import com.example.processmanager.entity.User;
import com.example.processmanager.mapper.NodeMapper;
import com.example.processmanager.mapper.UserMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class NodeService {
    // heartbeat가 이 시간 이상 끊기면 화면에서는 오프라인으로 간주합니다.
    private static final Duration NODE_OFFLINE_THRESHOLD = Duration.ofSeconds(15);

    private final NodeMapper nodeMapper;
    private final UserMapper userMapper;
    private final ProcessCommandService processCommandService;

    public NodeService(NodeMapper nodeMapper, UserMapper userMapper, ProcessCommandService processCommandService) {
        this.nodeMapper = nodeMapper;
        this.userMapper = userMapper;
        this.processCommandService = processCommandService;
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
    // 기존 노드면 상태 갱신, 신규면 자동 등록합니다.
    public Node connectAgent(Long userId, String hostname, String osType) {
        Node existing = nodeMapper.findByUserIdAndName(userId, hostname);
        if (existing == null) {
            // 첫 연결: 신규 노드 자동 등록
            Node newNode = Node.builder()
                    .userId(userId)
                    .name(hostname)
                    .osType(osType)
                    .build();
            nodeMapper.insert(newNode);
            Node createdNode = nodeMapper.findByUserIdAndName(userId, hostname);
            if (createdNode != null) {
                nodeMapper.updateHeartbeat(createdNode.getId());
            }
            return createdNode;
        } else {
            // 재연결: 상태를 온라인으로 갱신
            nodeMapper.updateStatus(existing.getId(), "Y");
            nodeMapper.updateHeartbeat(existing.getId());
            return nodeMapper.findById(existing.getId());
        }
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
