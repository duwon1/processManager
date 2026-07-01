import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { readJwtSubject } from '../utils/authToken';
import NotificationBell from './NotificationBell';

// tabs: 탭 목록 배열 (대시보드에서만 사용), title: 일반 페이지 제목
// tabKey/tabLabel: tabs 항목이 객체일 때 URL키/표시명 필드명 (기본값: 문자열 그대로 사용)
function Header({ title = '노드를 선택해주세요', tabs, activeTab, onTabChange, tabKey, tabLabel }) {
    const { logout, accessToken } = useAuth();
    const navigate = useNavigate();
    const { profile } = useAppData();

    // 드롭다운 열림 여부
    const [open, setOpen] = useState(false);
    const [failedProfilePicture, setFailedProfilePicture] = useState('');

    // JWT 토큰에서 사용자 이메일을 파생합니다. state 대신 memo를 써 렌더 흐름을 단순하게 유지합니다.
    const email = useMemo(() => {
        return readJwtSubject(accessToken);
    }, [accessToken]);
    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || 'U';
    const profilePicture = profile?.picture && failedProfilePicture !== profile.picture ? profile.picture : '';

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
        <div className="position-relative flex-shrink-0" ref={dropdownRef}>
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
                        onError={() => setFailedProfilePicture(profile.picture)}
                    />
                ) : (
                    <span>{displayName[0].toUpperCase()}</span>
                )}
            </button>
            {open && (
                <div className="position-absolute end-0 mt-2 py-2 bg-dark border border-secondary rounded shadow"
                     style={{ minWidth: '200px', zIndex: 3200 }}>
                    <div className="px-3 py-1 text-secondary small border-bottom border-secondary mb-1">
                        <div className="text-light text-truncate">{displayName}</div>
                        <div className="text-secondary text-truncate">{displayEmail}</div>
                    </div>
                    <div className="px-2 py-1 d-flex flex-column gap-1">
                        <button
                            type="button"
                            className="account-menu-action account-menu-action-default"
                            onClick={() => { setOpen(false); navigate('/settings'); }}
                        >
                            <i className="bi bi-gear"></i> 설정
                        </button>
                        <button
                            type="button"
                            className="account-menu-action account-menu-action-default"
                            onClick={() => { logout(); }}
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
        <nav className="navbar app-header" data-bs-theme="dark">

            {/* ── PC (md 이상): 탭 + 유저 아이콘 ── */}
            {tabs ? (
                <div className="app-header-tabs d-none d-md-flex gap-1 flex-grow-1">
                    {tabs.map(tab => {
                        const key   = tabKey   ? tab[tabKey]   : tab;
                        const label = tabLabel ? tab[tabLabel] : tab;
                        return (
                            <button
                                key={key}
                                className={`btn btn-sm app-header-tab ${activeTab === key ? 'app-header-tab-active text-light' : 'text-secondary'}`}
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
                    className="btn btn-sm flex-shrink-0 border-0 text-secondary"
                    style={{ background: 'transparent', boxShadow: 'none', marginRight: '1rem' }}
                    data-bs-toggle="offcanvas"
                    data-bs-target="#mobileSidebar"
                    aria-controls="mobileSidebar"
                    aria-label="메뉴 열기"
                >
                    ☰
                </button>
                {tabs ? (
                    <div className="app-header-tabs-mobile" style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0, flex: 1 }}>
                        {tabs.map(tab => {
                            const key   = tabKey   ? tab[tabKey]   : tab;
                            const label = tabLabel ? tab[tabLabel] : tab;
                            return (
                                <button
                                    key={key}
                                    className={`btn btn-sm app-header-tab flex-shrink-0 ${activeTab === key ? 'app-header-tab-active text-light' : 'text-secondary'}`}
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
            <div className="d-flex align-items-center gap-2 ms-auto flex-shrink-0">
                <NotificationBell />
                <div className="d-none d-md-block">{userIcon}</div>
            </div>
        </nav>

        </>
    );
}

export default Header;
