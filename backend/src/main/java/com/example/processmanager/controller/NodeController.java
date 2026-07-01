package com.example.processmanager.controller;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.service.NodeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Tag(name = "Node", description = "노드(에이전트) 조회·삭제·업데이트")
@RestController
@RequestMapping("/api/node")
public class NodeController {

    private final NodeService nodeService;

    public NodeController(NodeService nodeService) {
        this.nodeService = nodeService;
    }

    // 현재 사용자의 노드 목록을 조회합니다. (에이전트 연결 시 자동 등록됨)
    @Operation(summary = "노드 목록 조회", description = "현재 사용자가 접근 가능한 노드(소유 + 팀 공유) 목록을 반환합니다.")
    @GetMapping("/list")
    public ResponseEntity<List<NodeResponse>> list() {
        return ResponseEntity.ok(nodeService.getMyNodes());
    }

    // 노드를 삭제 대기 상태로 바꾸고, 에이전트 ACK 수신 후 실제 삭제합니다.
    @Operation(summary = "노드 삭제", description = "노드를 삭제 대기로 전환하고, 에이전트 언인스톨 ACK(또는 연결 해제) 후 실제 삭제합니다.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        nodeService.deleteNode(id);
        return ResponseEntity.ok().build();
    }

    // 에이전트에게 최신 코드로 업데이트 명령을 전송합니다.
    @Operation(summary = "노드 업데이트 명령", description = "해당 노드의 에이전트에 최신 코드로 업데이트하도록 명령합니다.")
    @PostMapping("/{id}/update")
    public ResponseEntity<Void> update(@PathVariable Long id) {
        nodeService.requestNodeUpdate(id);
        return ResponseEntity.ok().build();
    }

    // 현재 사용자 소유 노드 중 업데이트 대기 중인 목록을 반환합니다.
    @Operation(summary = "업데이트 대기 노드 조회", description = "소유 노드 중 업데이트 대기/진행/실패 상태인 노드 목록을 반환합니다.")
    @GetMapping("/updates")
    public ResponseEntity<List<Map<String, Object>>> pendingUpdates() {
        return ResponseEntity.ok(nodeService.getPendingUpdates());
    }

    // 업데이트 대기 중인 전체 노드에 일괄 업데이트 명령을 전송합니다.
    @Operation(summary = "전체 노드 일괄 업데이트", description = "업데이트 대기 중인 모든 소유 노드에 업데이트 명령을 전송합니다.")
    @PostMapping("/update-all")
    public ResponseEntity<Void> updateAll() {
        nodeService.requestAllUpdates();
        return ResponseEntity.ok().build();
    }
}
