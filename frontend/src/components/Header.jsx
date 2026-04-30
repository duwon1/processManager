import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from '../context/AuthContext';
import { useAuthFetch } from '../hooks/useAuthFetch';

// tabs: 탭 목록 배열 (대시보드에서만 사용), title: 일반 페이지 제목
// tabKey/tabLabel: tabs 항목이 객체일 때 URL키/표시명 필드명 (기본값: 문자열 그대로 사용)
function Header({ title = '노드를 선택해주세요', tabs, activeTab, onTabChange, tabKey, tabLabel }) {
    const { logout, accessToken } = useAuth();
    const navigate = useNavigate();
    const authFetch = useAuthFetch();

    // 드롭다운 열림 여부
    const [open, setOpen] = useState(false);

    // 업데이트 대기 노드 목록
    const [pendingUpdates, setPendingUpdates] = useState([]);
    const [updatingAll, setUpdatingAll] = useState(false);
    const updateStompRef = useRef(null);

    // 인증 후 업데이트 대기 목록을 조회합니다.
    const fetchPendingUpdates = useCallback(() => {
        if (!accessToken) return;
        authFetch('/api/node/updates')
            .then(res => res?.ok ? res.json() : [])
            .then(data => setPendingUpdates(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, [accessToken, authFetch]);

    useEffect(() => { fetchPendingUpdates(); }, [fetchPendingUpdates]);

    useEffect(() => {
        if (!accessToken) return undefined;

        // 에이전트 업데이트 알림/결과를 실시간으로 받아 상단 배너를 갱신합니다.
        const client = new Client({
            webSocketFactory: () => new SockJS('/ws'),
            connectHeaders: { jwt: accessToken },
            debug: () => {},
            reconnectDelay: 5000,
        });

        client.onConnect = () => {
            client.subscribe('/topic/agent.update-available', fetchPendingUpdates);
            client.subscribe('/topic/agent.update-result', fetchPendingUpdates);
        };

        updateStompRef.current = client;
        client.activate();

        return () => {
            updateStompRef.current = null;
            client.deactivate();
        };
    }, [accessToken, fetchPendingUpdates]);

    // 전체 업데이트 명령을 전송합니다.
    const handleUpdateAll = useCallback(async () => {
        setUpdatingAll(true);
        try {
            const res = await authFetch('/api/node/update-all', { method: 'POST' });
            if (res?.ok) fetchPendingUpdates();
        } finally {
            setUpdatingAll(false);
        }
    }, [authFetch, fetchPendingUpdates]);

    const updateLabel = useCallback((status) => {
        if (status === 'UPDATING') return '진행 중';
        if (status === 'FAILED') return '실패';
        return '대기';
    }, []);

    // JWT 토큰에서 사용자 이메일을 파생합니다. state 대신 memo를 써 렌더 흐름을 단순하게 유지합니다.
    const email = useMemo(() => {
        if (!accessToken) return '';
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            return payload.sub ?? '';
        } catch {
            return '';
        }
    }, [accessToken]);

    // 드롭다운 외부 클릭 시 닫기
    const dropdownRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 유저 아이콘 + 드롭다운 메뉴입니다.
    const userIcon = (
        <div className="position-relative ms-auto flex-shrink-0" ref={dropdownRef}>
            <button
                className="btn btn-dark btn-sm rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '36px', height: '36px', fontSize: '1rem' }}
                onClick={() => setOpen(prev => !prev)}
            >
                {email ? email[0].toUpperCase() : 'U'}
            </button>
            {open && (
                <div className="position-absolute end-0 mt-2 py-2 bg-dark border border-secondary rounded shadow"
                     style={{ minWidth: '200px', zIndex: 1000 }}>
                    <div className="px-3 py-1 text-secondary small border-bottom border-secondary mb-1">
                        {email}
                    </div>
                    <button
                        className="dropdown-item text-danger d-flex align-items-center gap-2"
                        onClick={() => { logout(); navigate('/login'); }}
                    >
                        <i className="bi bi-box-arrow-right"></i> 로그아웃
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <>
        <nav className="navbar" data-bs-theme="dark" style={{ borderBottom: '1px solid var(--bs-border-color)', padding: '0.6rem 1.5rem' }}>

            {/* ── PC (md 이상): 탭 + 유저 아이콘 ── */}
            {tabs ? (
                <div className="d-none d-md-flex gap-1 flex-grow-1">
                    {tabs.map(tab => {
                        const key   = tabKey   ? tab[tabKey]   : tab;
                        const label = tabLabel ? tab[tabLabel] : tab;
                        return (
                            <button
                                key={key}
                                className={`btn btn-sm px-3 border-0 fw-bold ${activeTab === key ? 'text-light' : 'text-secondary'}`}
                                style={{ background: 'transparent', fontSize: '0.88rem' }}
                                onClick={() => onTabChange(key)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <span className="d-none d-md-block text-secondary flex-grow-1" style={{ fontSize: '0.95rem' }}>{title}</span>
            )}

            {/* ── 모바일 (md 미만): 햄버거 + 탭 스크롤, 유저 아이콘은 사이드바에 있음 ── */}
            <div className="d-flex d-md-none align-items-center" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <button
                    className="btn btn-dark btn-sm flex-shrink-0 me-1"
                    data-bs-toggle="offcanvas"
                    data-bs-target="#mobileSidebar"
                    aria-controls="mobileSidebar"
                >
                    ☰
                </button>
                {tabs ? (
                    <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0, flex: 1 }}>
                        {tabs.map(tab => {
                            const key   = tabKey   ? tab[tabKey]   : tab;
                            const label = tabLabel ? tab[tabLabel] : tab;
                            return (
                                <button
                                    key={key}
                                    className={`btn btn-sm px-2 border-0 fw-bold flex-shrink-0 ${activeTab === key ? 'text-light' : 'text-secondary'}`}
                                    style={{ background: 'transparent', fontSize: '0.82rem' }}
                                    onClick={() => onTabChange(key)}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <span className="text-secondary" style={{ fontSize: '0.95rem' }}>{title}</span>
                )}
            </div>

            {/* 유저 아이콘 — PC만 표시 */}
            <div className="d-none d-md-block">{userIcon}</div>
        </nav>

        {/* 업데이트 대기 배너 — 인증된 사용자에게만 표시 */}
        {accessToken && pendingUpdates.length > 0 && (
            <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2"
                 style={{ background: '#1e1530', borderBottom: '1px solid #6f42c1', fontSize: '0.85rem' }}>
                <span className="text-warning fw-semibold">
                    ⬆ {pendingUpdates.length}개 노드에 업데이트가 있습니다
                </span>
                <span className="text-secondary d-none d-sm-inline" style={{ fontSize: '0.75rem' }}>
                    {pendingUpdates.map(n => `${n.nodeName}(${updateLabel(n.status)})`).join(', ')}
                </span>
                <div className="d-flex gap-2 ms-auto flex-shrink-0">
                    <button
                        className="btn btn-sm btn-outline-warning py-0"
                        style={{ fontSize: '0.8rem' }}
                        onClick={handleUpdateAll}
                        disabled={updatingAll}
                    >
                        {updatingAll ? '업데이트 중...' : '전체 업데이트'}
                    </button>
                    <button
                        className="btn-close btn-close-white opacity-50"
                        style={{ fontSize: '0.6rem' }}
                        onClick={() => setPendingUpdates([])}
                    />
                </div>
            </div>
        )}
        </>
    );
}

export default Header;
