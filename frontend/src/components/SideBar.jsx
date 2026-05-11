import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';
import { readJwtSubject } from '../utils/authToken';
import { getNodeStatusMeta } from '../utils/nodeStatus';

const splitCsv = (value) => (
    typeof value === 'string'
        ? value.split(',').map(item => item.trim()).filter(Boolean)
        : []
);

const nodeBelongsToTeam = (node, team) => {
    const teamId = String(team.id);
    const sharedTeamIds = splitCsv(node.sharedTeamIds);
    if (sharedTeamIds.includes(teamId)) return true;

    const sharedTeamNames = splitCsv(node.sharedTeamNames).map(name => name.toLowerCase());
    return sharedTeamNames.includes(String(team.name || '').trim().toLowerCase());
};

const Sidebar = () => {
    const [nodes, setNodes] = useState([]);
    const [teams, setTeams] = useState([]);
    const [hoveredId, setHoveredId] = useState(null);
    const [hoveredTeamId, setHoveredTeamId] = useState(null);
    const [expandedTeamIds, setExpandedTeamIds] = useState(() => new Set());
    const authFetch = useAuthFetch();
    const { logout, accessToken } = useAuth();
    const navigate = useNavigate();

    const email = useMemo(() => {
        return readJwtSubject(accessToken);
    }, [accessToken]);

    const fetchNodes = useCallback(() => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => startTransition(() => {
                const nextNodes = Array.isArray(data) ? data : [];
                setNodes([...nextNodes].sort((a, b) => getNodeStatusMeta(a.status).rank - getNodeStatusMeta(b.status).rank));
            }))
            .catch(() => startTransition(() => setNodes([])));
    }, [authFetch]);

    const fetchTeams = useCallback(() => {
        authFetch('/api/team/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => startTransition(() => setTeams(Array.isArray(data) ? data : [])))
            .catch(() => startTransition(() => setTeams([])));
    }, [authFetch]);

    useEffect(() => {
        fetchNodes();
        fetchTeams();
        const intervalId = setInterval(() => {
            fetchNodes();
            fetchTeams();
        }, 5000);
        return () => clearInterval(intervalId);
    }, [fetchNodes, fetchTeams]);

    const ownedNodes = useMemo(() => nodes.filter(node => node.owner), [nodes]);
    const teamNodes = useMemo(() => nodes.filter(node => !node.owner), [nodes]);
    const teamNodeMap = useMemo(() => {
        const next = new Map();
        teams.forEach(team => {
            next.set(String(team.id), teamNodes.filter(node => nodeBelongsToTeam(node, team)));
        });
        return next;
    }, [teamNodes, teams]);

    const toggleTeamExpanded = useCallback((teamId) => {
        const key = String(teamId);
        setExpandedTeamIds(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }, []);

    const renderNodeLink = (node, nodeKey, subtitle, compact = false) => {
        const statusMeta = getNodeStatusMeta(node.status);
        const isDeletePending = node.status === 'D';
        return (
            <NavLink
                key={nodeKey}
                to={`/dashboard/${node.id}`}
                onMouseEnter={() => setHoveredId(nodeKey)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => { if (isDeletePending) e.preventDefault(); }}
                aria-disabled={isDeletePending}
                className={({ isActive }) => `
                    nav-link d-flex align-items-center border border-secondary border-opacity-10 mb-1
                    ${isActive && !isDeletePending ? 'active shadow-lg text-white' : 'text-light'}
                    ${hoveredId === nodeKey && !isActive ? 'bg-light bg-opacity-10 border-opacity-50' : ''}
                `}
                style={({ isActive }) => ({
                    transform: hoveredId === nodeKey && !isDeletePending ? 'translateX(8px)' : 'none',
                    transition: 'all 0.3s ease',
                    minWidth: 0,
                    width: '100%',
                    padding: compact ? '8px 10px' : '12px 14px',
                    cursor: isDeletePending ? 'default' : 'pointer',
                    backgroundColor: isActive && !isDeletePending ? 'var(--bs-primary)' : undefined,
                    borderColor: isActive && !isDeletePending ? 'var(--bs-primary)' : undefined,
                })}
            >
                <span
                    className={`rounded-circle ${compact ? 'me-2' : 'me-3'} ${statusMeta.dotClass}`}
                    style={{ width: compact ? '8px' : '10px', height: compact ? '8px' : '10px', flexShrink: 0 }}
                />
                <span className="d-flex flex-column" style={{ minWidth: 0 }}>
                    <span className={`fw-bold text-truncate ${statusMeta.textClass}`}>{node.name}</span>
                    <span className="text-secondary text-truncate" style={{ fontSize: compact ? '0.68rem' : '0.7rem' }}>
                        {subtitle}
                    </span>
                </span>
            </NavLink>
        );
    };

    return (
        <div
            id="mobileSidebar"
            className="offcanvas-md offcanvas-start d-flex flex-column flex-shrink-0 p-3 h-100 border-end border-primary overflow-y-auto"
            tabIndex="-1"
            style={{ width: '260px' }}
        >
            <div className="mb-4 ps-2">
                <NavLink to="/" style={{ textDecoration: 'none' }}>
                    <h2 className="text-primary fw-bolder m-0 text-uppercase" style={{ fontSize: '2rem', cursor: 'pointer' }}>
                        Process<br /><span className="text-info">Manager</span>
                    </h2>
                </NavLink>
                <hr className="border-primary border-2 opacity-50 mt-3" />
            </div>

            <div className="d-flex flex-column gap-2 pe-2 mb-3">
                <NavLink
                    to="/main"
                    className={({ isActive }) => `nav-link d-flex align-items-center gap-2 border border-secondary border-opacity-10 ${isActive ? 'active text-white bg-primary' : 'text-light'}`}
                    style={{ padding: '10px 12px', borderRadius: '6px' }}
                >
                    <i className="bi bi-person-circle"></i>
                    <span className="fw-semibold">프로필</span>
                </NavLink>
                <NavLink
                    to="/teams"
                    className={({ isActive }) => `nav-link d-flex align-items-center gap-2 border border-secondary border-opacity-10 ${isActive ? 'active text-white bg-primary' : 'text-light'}`}
                    style={{ padding: '10px 12px', borderRadius: '6px' }}
                >
                    <i className="bi bi-people"></i>
                    <span className="fw-semibold">팀 관리</span>
                </NavLink>
            </div>

            <div className="d-flex flex-column mb-3 flex-shrink-0">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-uppercase">
                    <span className="fs-5 text-primary">내 노드</span>
                </div>

                <div className="d-flex flex-column gap-2 pe-2" style={{ maxHeight: '40vh', overflowY: 'auto', overflowX: 'hidden' }}>
                    {ownedNodes.length === 0 ? (
                        <p className="text-muted fst-italic small ps-2">내 노드가 없습니다.</p>
                    ) : ownedNodes.map(node => renderNodeLink(node, `owned-${node.id}`, '내 노드'))}
                </div>
            </div>

            <div className="d-flex flex-column mb-3 flex-shrink-0">
                <div className="d-flex align-items-center mb-3 ps-2 fw-bold small text-uppercase">
                    <span className="fs-5 text-secondary">팀 노드</span>
                </div>
                <div className="d-flex flex-column gap-2 pe-2" style={{ maxHeight: '32vh', overflowY: 'auto', overflowX: 'hidden' }}>
                    {teams.length === 0 ? (
                        <p className="text-muted fst-italic small ps-2">소속 팀이 없습니다.</p>
                    ) : teams.map(team => {
                        const teamKey = String(team.id);
                        const teamNodesForTeam = teamNodeMap.get(teamKey) || [];
                        const expanded = expandedTeamIds.has(teamKey);
                        return (
                            <div key={team.id} className="mb-1">
                                <button
                                    type="button"
                                    onMouseEnter={() => setHoveredTeamId(team.id)}
                                    onMouseLeave={() => setHoveredTeamId(null)}
                                    onClick={() => toggleTeamExpanded(team.id)}
                                    aria-expanded={expanded}
                                    className={`nav-link d-flex align-items-center border border-secondary border-opacity-10 text-light text-start ${hoveredTeamId === team.id ? 'bg-light bg-opacity-10 border-opacity-50' : ''}`}
                                    style={{
                                        transform: hoveredTeamId === team.id ? 'translateX(8px)' : 'none',
                                        transition: 'all 0.3s ease',
                                        minWidth: 0,
                                        width: '100%',
                                        padding: '10px 12px',
                                        backgroundColor: 'transparent',
                                    }}
                                >
                                    <span
                                        className="rounded-circle me-3 bg-info bg-opacity-75 d-inline-flex align-items-center justify-content-center text-dark fw-bold"
                                        style={{ width: '24px', height: '24px', flexShrink: 0, fontSize: '0.75rem' }}
                                    >
                                        {(team.name || 'T')[0].toUpperCase()}
                                    </span>
                                    <span className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                                        <span className="fw-bold text-truncate">{team.name}</span>
                                        <span className="text-secondary text-truncate" style={{ fontSize: '0.72rem' }}>
                                            {team.role} · 팀노드 {teamNodesForTeam.length}
                                        </span>
                                    </span>
                                    <i className={`bi ${expanded ? 'bi-chevron-up' : 'bi-chevron-down'} text-secondary ms-2 flex-shrink-0`}></i>
                                </button>
                                {expanded && (
                                    <div className="d-flex flex-column gap-1 mt-2 ps-2">
                                        {teamNodesForTeam.length === 0 ? (
                                            <p className="text-muted fst-italic small mb-1 ps-2">공유 노드 없음</p>
                                        ) : teamNodesForTeam.map(node => (
                                            renderNodeLink(node, `team-${team.id}-${node.id}`, '팀 노드', true)
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-auto pt-3 border-top border-secondary border-opacity-25">
                <div className="d-flex d-md-none flex-column gap-2 mb-3">
                    <div className="d-flex align-items-center gap-2">
                        <div
                            className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                            style={{ width: '30px', height: '30px', background: 'var(--bs-info)', color: '#000', fontSize: '0.85rem' }}
                        >
                            {email ? email[0].toUpperCase() : 'U'}
                        </div>
                        <span className="text-secondary small" style={{ wordBreak: 'break-all' }}>{email}</span>
                    </div>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-danger w-100"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => { logout(); navigate('/login'); }}
                    >
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
