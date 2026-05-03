import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAuthFetch } from '../hooks/useAuthFetch';

// tabs: 탭 목록 배열 (대시보드에서만 사용), title: 일반 페이지 제목
// tabKey/tabLabel: tabs 항목이 객체일 때 URL키/표시명 필드명 (기본값: 문자열 그대로 사용)
function Header({ title = '노드를 선택해주세요', tabs, activeTab, onTabChange, tabKey, tabLabel }) {
    const { logout, accessToken } = useAuth();
    const { showToast: showUpdateToast } = useToast();
    const navigate = useNavigate();
    const authFetch = useAuthFetch();

    // 드롭다운 열림 여부
    const [open, setOpen] = useState(false);
    const [profile, setProfile] = useState(null);
    const [profileImageFailed, setProfileImageFailed] = useState(false);

    const fetchProfile = useCallback(() => {
        if (!accessToken) {
            return;
        }

        authFetch('/api/user/me')
            .then(res => res?.ok ? res.json() : null)
            .then(data => {
                setProfile(data);
                setProfileImageFailed(false);
            })
            .catch(() => setProfile(null));
    }, [accessToken, authFetch]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const getSafeErrorMessage = (message, fallback) => {
        if (typeof message !== 'string' || !message.trim() || message.length > 120) {
            return fallback;
        }
        const lower = message.toLowerCase();
        const blockedTerms = ['sql', 'jdbc', 'constraint', 'column', 'table', 'exception', 'preparedstatement', 'java.'];
        return blockedTerms.some(term => lower.includes(term)) ? fallback : message;
    };

    const readErrorMessage = async (res, fallback) => {
        try {
            const data = await res.json();
            return getSafeErrorMessage(data.message, fallback);
        } catch {
            return fallback;
        }
    };

    const getSafeUpdateMessage = useCallback((message, fallback = '업데이트 처리 중 문제가 발생했습니다. 서버 로그를 확인해주세요.') => {
        if (typeof message !== 'string' || !message.trim()) {
            return fallback;
        }
        const text = message.trim();
        const lower = text.toLowerCase();
        const blockedTerms = [
            'bash:', 'fatal:', 'traceback', 'exception', 'bad interpreter', 'no such file',
            'github.com', 'fetch_head', '/opt/', '/home/', '.venv', 'java.', 'sql', 'jdbc',
        ];
        if (text.length > 160 || blockedTerms.some(term => lower.includes(term))) {
            return fallback;
        }
        return text;
    }, []);

    const handleDeleteAccount = async () => {
        const typed = prompt('회원탈퇴를 진행하려면 "동의합니다"를 입력하세요.');
        if (typed === null) return;
        if (typed !== '동의합니다') {
            showUpdateToast({ type: 'warning', title: '회원탈퇴 취소', message: '입력값이 일치하지 않습니다.' });
            return;
        }

        try {
            const res = await authFetch('/api/user/me', { method: 'DELETE' });
            if (res?.ok) {
                showUpdateToast({ type: 'success', title: '회원탈퇴 완료', message: '계정이 삭제되었습니다.' });
                logout();
                navigate('/login', { replace: true });
            } else if (res) {
                showUpdateToast({
                    type: 'danger',
                    title: '회원탈퇴 실패',
                    message: await readErrorMessage(res, '회원탈퇴에 실패했습니다.'),
                });
            }
        } catch {
            showUpdateToast({ type: 'danger', title: '회원탈퇴 실패', message: '회원탈퇴에 실패했습니다.' });
        }
    };

    const handleUpdateAvailableFrame = useCallback((frame) => {
        try {
            const data = JSON.parse(frame.body);
            const nodeName = data.nodeName || data.agentId || '에이전트';
            showUpdateToast({ type: 'warning', title: '업데이트 가능', message: `${nodeName} 업데이트가 있습니다.` });
        } catch {
            showUpdateToast({ type: 'warning', title: '업데이트 가능', message: '에이전트 업데이트가 있습니다.' });
        }
    }, [showUpdateToast]);

    const handleUpdateResultFrame = useCallback((frame) => {
        try {
            const result = JSON.parse(frame.body);
            const stage = String(result.stage ?? '');
            if (stage === 'checked') return;

            const nodeName = result.nodeName || result.agentId || '에이전트';
            if (stage === 'started') {
                showUpdateToast({ type: 'info', title: '업데이트 진행', message: `${nodeName} 업데이트를 시작했습니다.` });
                return;
            }

            if (result.success === true) {
                showUpdateToast({ type: 'success', title: '업데이트 성공', message: `${nodeName} 업데이트가 완료되었습니다.` });
                return;
            }

            if (stage === 'failed' || result.success === false) {
                const message = getSafeUpdateMessage(result.message);
                showUpdateToast({ type: 'danger', title: '업데이트 실패', message: `${nodeName} 업데이트에 실패했습니다. ${message}` });
                return;
            }
        } catch {
            showUpdateToast({ type: 'danger', title: '업데이트 실패', message: '에이전트 업데이트 결과를 확인하지 못했습니다.' });
        }
    }, [getSafeUpdateMessage, showUpdateToast]);

    useEffect(() => {
        if (!accessToken || !profile?.id) return undefined;

        // 에이전트 업데이트 알림/결과를 실시간으로 받아 배너와 토스트를 갱신합니다.
        const client = new Client({
            webSocketFactory: () => new SockJS('/ws'),
            connectHeaders: { jwt: accessToken },
            debug: () => {},
            reconnectDelay: 5000,
        });

        client.onConnect = () => {
            client.subscribe(`/topic/user.${profile.id}.agent.update-available`, handleUpdateAvailableFrame);
            client.subscribe(`/topic/user.${profile.id}.agent.update-result`, handleUpdateResultFrame);
        };

        client.activate();

        return () => {
            client.deactivate();
        };
    }, [accessToken, profile?.id, handleUpdateAvailableFrame, handleUpdateResultFrame]);

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
    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || 'U';
    const profilePicture = profileImageFailed ? '' : profile?.picture;

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
                style={{ width: '36px', height: '36px', fontSize: '1rem', overflow: 'hidden', padding: 0 }}
                onClick={() => setOpen(prev => !prev)}
                aria-label="\uC0AC\uC6A9\uC790 \uBA54\uB274"
            >
                {profilePicture ? (
                    <img
                        src={profilePicture}
                        alt=""
                        className="w-100 h-100"
                        style={{ objectFit: 'cover' }}
                        referrerPolicy="no-referrer"
                        onError={() => setProfileImageFailed(true)}
                    />
                ) : (
                    <span>{displayName[0].toUpperCase()}</span>
                )}
            </button>
            {open && (
                <div className="position-absolute end-0 mt-2 py-2 bg-dark border border-secondary rounded shadow"
                     style={{ minWidth: '200px', zIndex: 1000 }}>
                    <div className="px-3 py-1 text-secondary small border-bottom border-secondary mb-1">
                        <div className="text-light text-truncate">{displayName}</div>
                        <div className="text-secondary text-truncate">{displayEmail}</div>
                    </div>
                    <div className="px-2 py-1 d-flex flex-column gap-1">
                        <button
                            type="button"
                            className="account-menu-action account-menu-action-danger"
                            onClick={() => { setOpen(false); handleDeleteAccount(); }}
                        >
                            <i className="bi bi-person-x"></i> 회원탈퇴
                        </button>
                        <button
                            type="button"
                            className="account-menu-action account-menu-action-default"
                            onClick={() => { logout(); navigate('/login'); }}
                        >
                            <i className="bi bi-box-arrow-right"></i> {'\uB85C\uADF8\uC544\uC6C3'}
                        </button>
                    </div>
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

        </>
    );
}

export default Header;
