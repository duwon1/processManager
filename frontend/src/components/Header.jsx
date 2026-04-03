import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// tabs: 탭 목록 배열 (대시보드에서만 사용), title: 일반 페이지 제목
function Header({ title = '노드를 선택해주세요', tabs, activeTab, onTabChange }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // 드롭다운 열림 여부
    const [open, setOpen] = useState(false);

    // JWT 토큰에서 사용자 이메일을 추출합니다.
    const [email, setEmail] = useState('');
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setEmail(payload.sub);
            } catch (_) {}
        }
    }, []);

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

    return (
        <nav className="navbar" data-bs-theme="dark" style={{ borderBottom: '1px solid var(--bs-border-color)', padding: '0.6rem 1.5rem' }}>
            {/* 모바일에서만 표시되는 햄버거 버튼 - 클릭 시 사이드바 오픈 */}
            <button
                className="btn btn-dark btn-sm d-md-none me-2"
                data-bs-toggle="offcanvas"
                data-bs-target="#mobileSidebar"
                aria-controls="mobileSidebar"
            >
                ☰
            </button>

            {/* 탭이 있으면 탭 목록, 없으면 페이지 제목 표시 */}
            {tabs ? (
                <div className="d-flex gap-1">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            className={`btn btn-sm px-3 border-0 fw-bold
                                ${activeTab === tab ? 'text-light' : 'text-secondary'}`}
                            style={{ background: 'transparent', fontSize: '0.88rem' }}
                            onClick={() => onTabChange(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            ) : (
                <span className="text-secondary" style={{ fontSize: '0.95rem' }}>{title}</span>
            )}

            {/* 우측: 유저 아이콘 + 드롭다운 */}
            <div className="position-relative" ref={dropdownRef}>
                <button
                    className="btn btn-dark btn-sm rounded-circle d-flex align-items-center justify-content-center"
                    style={{ width: '36px', height: '36px', fontSize: '1rem' }}
                    onClick={() => setOpen(prev => !prev)}
                >
                    {/* 이메일 첫 글자를 아이콘으로 표시 */}
                    {email ? email[0].toUpperCase() : 'U'}
                </button>

                {/* 드롭다운 메뉴 */}
                {open && (
                    <div className="position-absolute end-0 mt-2 py-2 bg-dark border border-secondary rounded shadow"
                         style={{ minWidth: '200px', zIndex: 1000 }}>
                        {/* 이메일 표시 */}
                        <div className="px-3 py-1 text-secondary small border-bottom border-secondary mb-1">
                            {email}
                        </div>
                        {/* 로그아웃 버튼 */}
                        <button
                            className="dropdown-item text-danger d-flex align-items-center gap-2"
                            onClick={() => { logout(); navigate('/login'); }}
                        >
                            <i className="bi bi-box-arrow-right"></i> 로그아웃
                        </button>
                    </div>
                )}
            </div>
        </nav>
    );
}

export default Header;
