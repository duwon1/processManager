import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar = () => {
    // 노드 데이터
    const [nodes] = useState([
        { id: 1, name: 'Node 1 (Master)', status: 'online' },
        { id: 2, name: 'Workstation-A', status: 'offline' },
        { id: 3, name: 'Ubuntu-Server', status: 'online' },
        { id: 4, name: 'Backup-PC', status: 'online' },
    ]);

    // 호버 상태 관리
    const [hoveredId, setHoveredId] = useState(null);

    return (
        // sticky-top 제거, h-100을 사용하여 부모의 높이를 꽉 채우도록 수정했습니다.
        <div className="d-flex flex-column flex-shrink-0 p-4 h-100 border-end border-primary" style={{ width: '280px' }}>

            {/* 1. 프로젝트 로고 */}
            <div className="mb-4 ps-2">
                <h2 className="text-primary fw-bolder m-0 text-uppercase" style={{ fontSize: '2rem' }}>
                    Process<br /><span className="text-info">Manager</span>
                </h2>
                <hr className="border-primary border-2 opacity-50 mt-3" />
            </div>

            {/* 2. 노드 목록 섹션 */}
            <div className="mb-5">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-success text-uppercase">
                    <i className="bi me-2"></i>
                    <span className="fs-5 text-primary">노드 목록</span>
                </div>

                <div className="nav nav-pills flex-column gap-2">
                    {nodes.map(node => (
                        <NavLink
                            key={node.id}
                            to={`/nodes/${node.id}`}
                            onMouseEnter={() => setHoveredId(node.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            // bg-light + bg-opacity 조합으로 "빛 비춤" 효과 구현
                            className={({ isActive }) => `
                                nav-link d-flex align-items-center border border-secondary border-opacity-10 transition-all mb-1
                                ${isActive ? 'active shadow-lg text-white' : 'text-light'}
                                ${hoveredId === node.id && !isActive ? 'bg-light bg-opacity-10 border-opacity-50' : ''}
                            `}
                            style={{
                                // 부트스트랩 클래스로 해결 안 되는 유일한 애니메이션(이동)만 인라인 유지
                                transform: hoveredId === node.id ? 'translateX(8px)' : 'none',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {/* 상태 점 */}
                            <span className={`rounded-circle me-3 ${node.status === 'online' ? 'bg-success' : 'bg-danger'}`}
                                  style={{ width: '10px', height: '10px' }}>
                            </span>

                            {/* 노드 이름 */}
                            <span className={`fw-bold ${node.status === 'online' ? 'text-success' : 'text-danger'}`}>
                                {node.name}
                            </span>
                        </NavLink>
                    ))}
                </div>
            </div>

            {/* 3. 팀 관리 섹션 */}
            <div className="mb-4 text-start">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-success text-uppercase">
                    <i className="bi bi-cpu-fill me-2"></i>
                    <span className="fs-5 text-secondary">팀 목록</span>
                </div>
                <div className="ps-4 border-start border-secondary border-opacity-25 ms-2">
                    <p className="text-muted small m-0 fst-italic">생성된 팀이 없습니다.</p>
                </div>
            </div>

            {/* 4. 하단 시스템 상태 */}
            <div className="mt-auto pt-3 border-top border-secondary border-opacity-25">
                <div className="d-flex justify-content-between align-items-center px-1">
                    <span className="badge rounded-pill bg-primary text-dark fw-bold">v1.0.4</span>
                    <small className="text-info opacity-50 fw-bold">SYSTEM ACTIVE</small>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;