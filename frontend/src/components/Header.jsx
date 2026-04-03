import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// tabs: 탭 목록 배열 (대시보드에서만 사용), title: 일반 페이지 제목
// tabKey/tabLabel: tabs 항목이 객체일 때 URL키/표시명 필드명 (기본값: 문자열 그대로 사용)
function Header({ title = '노드를 선택해주세요', tabs, activeTab, onTabChange, tabKey, tabLabel }) {
    const { logout, accessToken } = useAuth();
    const navigate = useNavigate();

    // 드롭다운 열림 여부
    const [open, setOpen] = useState(false);

    // JWT 토큰에서 사용자 이메일을 추출합니다. (localStorage 대신 메모리 토큰 사용)
    const [email, setEmail] = useState('');
    useEffect(() => {
        if (accessToken) {
            try {
                const payload = JSON.parse(atob(accessToken.split('.')[1]));
                setEmail(payload.sub);
            } catch (_) {}
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
    );
}

export default Header;
