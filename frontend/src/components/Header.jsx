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

    // 업데이트 대기 노드 목록
    const [pendingUpdates, setPendingUpdates] = useState([]);
    const [updatingAll, setUpdatingAll] = useState(false);
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [notificationError, setNotificationError] = useState('');

    // 인증 후 업데이트 대기 목록을 조회합니다.
    const fetchPendingUpdates = useCallback(() => {
        if (!accessToken) {
            setPendingUpdates([]);
            return;
        }
        authFetch('/api/node/updates')
            .then(res => res?.ok ? res.json() : [])
            .then(data => setPendingUpdates(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, [accessToken, authFetch]);

    useEffect(() => { fetchPendingUpdates(); }, [fetchPendingUpdates]);

    const fetchProfile = useCallback(() => {
        if (!accessToken) {
            setProfile(null);
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

    const handleUpdateResultFrame = useCallback((frame) => {
        fetchPendingUpdates();

        try {
            const result = JSON.parse(frame.body);
            const stage = String(result.stage ?? '');
            if (stage === 'checked') return;

            const nodeName = result.nodeName || result.agentId || '에이전트';
            if (stage === 'failed' || result.success === false) {
                const message = result.message ? `: ${result.message}` : '';
                setNotificationError(`${nodeName} 업데이트에 실패했습니다${message}`);
                return;
            }

            setNotificationError('');
        } catch {
            setNotificationError('에이전트 업데이트 결과를 확인하지 못했습니다.');
        }
    }, [fetchPendingUpdates]);

    useEffect(() => {
        if (!accessToken || !profile?.id) return undefined;

        // 에이전트 업데이트 알림/결과를 실시간으로 받아 종 알림을 갱신합니다.
        const client = new Client({
            webSocketFactory: () => new SockJS('/ws'),
            connectHeaders: { jwt: accessToken },
            debug: () => {},
            reconnectDelay: 5000,
        });

        client.onConnect = () => {
            client.subscribe(`/topic/user.${profile.id}.agent.update-available`, fetchPendingUpdates);
            client.subscribe(`/topic/user.${profile.id}.agent.update-result`, handleUpdateResultFrame);
        };

        client.activate();

        return () => {
            client.deactivate();
        };
    }, [accessToken, profile?.id, fetchPendingUpdates, handleUpdateResultFrame]);

    // 전체 업데이트 명령을 전송합니다.
    const handleUpdateAll = useCallback(async () => {
        setUpdatingAll(true);
        try {
            const res = await authFetch('/api/node/update-all', { method: 'POST' });
            if (res?.ok) {
                setNotificationError('');
                setNotificationOpen(true);
                fetchPendingUpdates();
            } else {
                setNotificationError('에이전트 업데이트 명령 전송에 실패했습니다.');
                setNotificationOpen(true);
            }
        } catch {
            setNotificationError('에이전트 업데이트 명령 전송 중 오류가 발생했습니다.');
            setNotificationOpen(true);
        } finally {
            setUpdatingAll(false);
        }
    }, [authFetch, fetchPendingUpdates]);

    const updateLabel = useCallback((status) => {
        if (status === 'UPDATING') return '진행 중';
        if (status === 'FAILED') return '실패';
        return '대기';
    }, []);

    const updateBadgeClass = useCallback((status) => {
        if (status === 'UPDATING') return 'text-bg-info';
        if (status === 'FAILED') return 'text-bg-danger';
        return 'text-bg-warning';
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
    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || 'U';
    const profilePicture = profileImageFailed ? '' : profile?.picture;
    const notificationCount = pendingUpdates.length + (notificationError ? 1 : 0);
    const hasNotifications = notificationCount > 0;

    // 드롭다운 외부 클릭 시 닫기
    const dropdownRef = useRef(null);
    const notificationRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
            if (notificationRef.current && !notificationRef.current.contains(e.target)) {
                setNotificationOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const notificationBell = (
        <div className="position-relative flex-shrink-0" ref={notificationRef}>
            <button
                type="button"
                className={`btn btn-dark btn-sm rounded-circle notification-icon-button ${hasNotifications ? 'text-warning' : 'text-secondary'}`}
                onClick={() => {
                    setNotificationOpen(prev => !prev);
                    setOpen(false);
                }}
                aria-label="알림"
            >
                <i className={`bi ${hasNotifications ? 'bi-bell-fill' : 'bi-bell'}`}></i>
                {hasNotifications && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger notification-badge">
                        {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                )}
            </button>
            {notificationOpen && (
                <div className="notification-menu position-absolute end-0 mt-2 bg-dark border border-secondary rounded shadow">
                    <div className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom border-secondary">
                        <span className="text-light fw-semibold">알림</span>
                        {hasNotifications && <span className="badge text-bg-warning">{notificationCount}</span>}
                    </div>

                    <div className="notification-menu-body">
                        {!hasNotifications && (
                            <div className="px-3 py-4 text-center text-secondary small">
                                새 알림이 없습니다.
                            </div>
                        )}

                        {notificationError && (
                            <div className="notification-menu-item d-flex align-items-start gap-2 border-bottom border-secondary">
                                <i className="bi bi-exclamation-triangle-fill text-danger mt-1"></i>
                                <div className="min-w-0 flex-grow-1">
                                    <div className="text-light small fw-semibold">업데이트 오류</div>
                                    <div className="text-secondary small text-break">{notificationError}</div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white opacity-50 flex-shrink-0"
                                    style={{ fontSize: '0.6rem' }}
                                    onClick={() => setNotificationError('')}
                                    aria-label="알림 닫기"
                                />
                            </div>
                        )}

                        {pendingUpdates.map(update => {
                            const currentSha = update.currentSha ? String(update.currentSha).slice(0, 7) : '';
                            const latestSha = update.latestSha ? String(update.latestSha).slice(0, 7) : '';
                            const shaText = currentSha && latestSha ? `${currentSha} -> ${latestSha}` : '';
                            const detail = update.message || shaText || '에이전트 업데이트가 필요합니다.';

                            return (
                                <div key={`${update.nodeId}-${update.status}`} className="notification-menu-item border-bottom border-secondary">
                                    <div className="d-flex align-items-start justify-content-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-light small fw-semibold text-truncate">{update.nodeName}</div>
                                            <div className="text-secondary small text-break">{detail}</div>
                                        </div>
                                        <span className={`badge ${updateBadgeClass(update.status)} flex-shrink-0`}>
                                            {updateLabel(update.status)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {pendingUpdates.length > 0 && (
                        <div className="px-3 py-2 border-top border-secondary">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-warning w-100"
                                onClick={handleUpdateAll}
                                disabled={updatingAll}
                            >
                                <i className="bi bi-arrow-repeat me-1"></i>
                                {updatingAll ? '업데이트 중...' : '전체 업데이트'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // 유저 아이콘 + 드롭다운 메뉴입니다.
    const userIcon = (
        <div className="position-relative flex-shrink-0" ref={dropdownRef}>
            <button
                className="btn btn-dark btn-sm rounded-circle d-flex align-items-center justify-content-center"
                style={{ width: '36px', height: '36px', fontSize: '1rem', overflow: 'hidden', padding: 0 }}
                onClick={() => {
                    setOpen(prev => !prev);
                    setNotificationOpen(false);
                }}
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

            <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                {accessToken && notificationBell}
                <div className="d-none d-md-block">{userIcon}</div>
            </div>
        </nav>
        </>
    );
}

export default Header;
