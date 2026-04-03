package com.example.processmanager.controller;

import com.example.processmanager.dto.NodeResponse;
import com.example.processmanager.service.NodeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
}
