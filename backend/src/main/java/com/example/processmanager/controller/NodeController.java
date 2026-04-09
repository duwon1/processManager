package com.example.processmanager.controller;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.service.NodeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/node")
public class NodeController {

    private final NodeService nodeService;

    public NodeController(NodeService nodeService) {
        this.nodeService = nodeService;
    }

    // 현재 사용자의 노드 목록을 조회합니다. (에이전트 연결 시 자동 등록됨)
    @GetMapping("/list")
    public ResponseEntity<List<NodeResponse>> list() {
        return ResponseEntity.ok(nodeService.getMyNodes());
    }

    // 노드를 삭제합니다. 에이전트 재접속 시 자가 삭제 명령이 전송됩니다.
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        nodeService.deleteNode(id);
        return ResponseEntity.ok().build();
    }

    // 에이전트에게 최신 코드로 업데이트 명령을 전송합니다.
    @PostMapping("/{id}/update")
    public ResponseEntity<Void> update(@PathVariable Long id) {
        nodeService.requestNodeUpdate(id);
        return ResponseEntity.ok().build();
    }
}
