import React, { startTransition, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
    // 서버에서 가져온 실제 노드 목록
    const [nodes, setNodes] = useState([]);
    const [hoveredId, setHoveredId] = useState(null);
    const authFetch = useAuthFetch();
    const { logout, accessToken } = useAuth();
    const navigate = useNavigate();

    // JWT에서 이메일을 추출합니다.
    const [email, setEmail] = useState('');
    useEffect(() => {
        if (accessToken) {
            try {
                const payload = JSON.parse(atob(accessToken.split('.')[1]));
                setEmail(payload.sub);
            } catch (_) {}
        }
    }, [accessToken]);

    // 노드 상태가 바뀌면 화면에서도 몇 초 안에 반영되도록 주기적으로 다시 조회합니다.
    const fetchNodes = () => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            // 온라인(Y) 노드를 먼저 표시합니다.
            .then(data => startTransition(() => setNodes([...data].sort((a, b) => (a.status === 'Y' ? -1 : 1) - (b.status === 'Y' ? -1 : 1)))))
            .catch(() => startTransition(() => setNodes([])));
    };

    // 컴포넌트 마운트 시 내 노드 목록을 API에서 조회합니다.
    // 401 응답 시 useAuthFetch가 자동으로 로그인 페이지로 이동합니다.
    useEffect(() => {
        fetchNodes();
        const intervalId = setInterval(fetchNodes, 5000);
        return () => clearInterval(intervalId);
    }, []);

    return (
        /* offcanvas-md: 모바일에서는 슬라이드 메뉴, PC(md+)에서는 고정 사이드바로 동작합니다. */
        <div id="mobileSidebar"
             className="offcanvas-md offcanvas-start d-flex flex-column flex-shrink-0 p-3 h-100 border-end border-primary overflow-y-auto"
             tabIndex="-1"
             style={{ width: '260px' }}>

            {/* 1. 프로젝트 로고 — 클릭 시 메인 페이지로 이동합니다. */}
            <div className="mb-4 ps-2">
                <NavLink to="/" style={{ textDecoration: 'none' }}>
                    <h2 className="text-primary fw-bolder m-0 text-uppercase" style={{ fontSize: '2rem', cursor: 'pointer' }}>
                        Process<br /><span className="text-info">Manager</span>
                    </h2>
                </NavLink>
                <hr className="border-primary border-2 opacity-50 mt-3" />
            </div>

            {/* 2. 노드 목록 섹션 — max-height로 영역 고정 후 세로 스크롤합니다. */}
            <div className="d-flex flex-column mb-3 flex-shrink-0">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-uppercase">
                    <span className="fs-5 text-primary">노드 목록</span>
                </div>

                <div className="d-flex flex-column gap-2 pe-2" style={{ maxHeight: '40vh', overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* 온라인 노드 우선 정렬 후 표시 */}
                    {nodes.length === 0 ? (
                        <p className="text-muted fst-italic small ps-2">등록된 노드가 없습니다.</p>
                    ) : nodes.map(node => (
                        <NavLink
                            key={node.id}
                            to={`/dashboard/${node.id}`}
                            onMouseEnter={() => setHoveredId(node.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className={({ isActive }) => `
                                nav-link d-flex align-items-center border border-secondary border-opacity-10 mb-1
                                ${isActive ? 'active shadow-lg text-white' : 'text-light'}
                                ${hoveredId === node.id && !isActive ? 'bg-light bg-opacity-10 border-opacity-50' : ''}
                            `}
                            style={({ isActive }) => ({
                                transform: hoveredId === node.id ? 'translateX(8px)' : 'none',
                                transition: 'all 0.3s ease',
                                minWidth: 0,
                                width: '100%',
                                padding: '12px 14px',
                                backgroundColor: isActive ? 'var(--bs-primary)' : undefined,
                                borderColor: isActive ? 'var(--bs-primary)' : undefined,
                            })}
                        >
                            {/* 온라인/오프라인 상태 점 */}
                            <span
                                className={`rounded-circle me-3 ${node.status === 'Y' ? 'bg-success' : 'bg-danger'}`}
                                style={{ width: '10px', height: '10px', flexShrink: 0 }}
                            />
                            {/* 노드 이름 — 길면 말줄임 처리합니다. */}
                            <span className={`fw-bold text-truncate ${node.status === 'Y' ? 'text-success' : 'text-danger'}`}>
                                {node.name}
                            </span>
                        </NavLink>
                    ))}
                </div>
            </div>

            {/* 3. 팀 목록 섹션 — 노드 목록과 동일한 구조로 구성합니다. */}
            <div className="d-flex flex-column mb-3 flex-shrink-0">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-uppercase">
                    <span className="fs-5 text-secondary">팀 목록</span>
                </div>
                <div className="d-flex flex-column gap-2 pe-2" style={{ maxHeight: '20vh', overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* 팀 목록 — 현재 팀 기능 미구현 */}
                    <p className="text-muted fst-italic small ps-2">생성된 팀이 없습니다.</p>
                </div>
            </div>

            {/* 4. 하단: 유저 정보 (모바일에서만 표시) + 시스템 상태 */}
            <div className="mt-auto pt-3 border-top border-secondary border-opacity-25">
                {/* 모바일에서만 유저 정보 + 로그아웃 표시 */}
                <div className="d-flex d-md-none flex-column gap-2 mb-3">
                    <div className="d-flex align-items-center gap-2">
                        <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                             style={{ width: '30px', height: '30px', background: 'var(--bs-info)', color: '#000', fontSize: '0.85rem' }}>
                            {email ? email[0].toUpperCase() : 'U'}
                        </div>
                        {/* 이메일이 길면 줄바꿈되도록 word-break 적용 */}
                        <span className="text-secondary small" style={{ wordBreak: 'break-all' }}>{email}</span>
                    </div>
                    <button className="btn btn-sm btn-outline-danger w-100" style={{ fontSize: '0.8rem' }}
                            onClick={() => { logout(); navigate('/login'); }}>
                        로그아웃
                    </button>
                </div>
                <div className="d-flex justify-content-between align-items-center px-1">
                    <span className="badge rounded-pill bg-primary text-dark fw-bold">v1.0.4</span>
                    <small className="text-info opacity-50 fw-bold">SYSTEM ACTIVE</small>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
