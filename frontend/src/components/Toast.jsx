import React, { useEffect, useState } from 'react';

// type: 'success' | 'danger' | 'warning' | 'info'
const Toast = ({ message, type = 'danger', onClose }) => {
    const [visible, setVisible] = useState(false);

    const onCloseRef = React.useRef(onClose);
    onCloseRef.current = onClose;

    // 마운트 시 슬라이드 인 애니메이션 트리거
    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onCloseRef.current(), 300); // 애니메이션 후 제거
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    // 타입별 부트스트랩 CSS 변수 사용
    const colorMap = {
        success: { border: 'var(--bs-purple)', icon: '✦', label: '성공' },
        danger:  { border: 'var(--bs-pink)',   icon: '✕', label: '오류' },
        warning: { border: 'var(--bs-warning)', icon: '⚠', label: '경고' },
        info:    { border: 'var(--bs-info)',    icon: 'ℹ', label: '안내' },
    };
    const { border, icon, label } = colorMap[type] || colorMap.danger;

    return (
        <div
            className="position-fixed top-0 end-0 p-3"
            style={{ zIndex: 9999 }}
        >
            <div
                role="alert"
                style={{
                    minWidth: '280px',
                    background: 'rgba(var(--bs-dark-rgb), 0.92)',
                    border: `1px solid ${border}`,
                    borderLeft: `4px solid ${border}`,
                    borderRadius: '8px',
                    boxShadow: `0 0 16px ${border}`,
                    color: 'var(--bs-light)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    transform: visible ? 'translateX(0)' : 'translateX(110%)',
                    opacity: visible ? 1 : 0,
                    transition: 'transform 0.3s ease, opacity 0.3s ease',
                }}
            >
                {/* 아이콘 */}
                <span style={{ color: border, fontSize: '1rem', marginTop: '2px' }}>{icon}</span>

                {/* 텍스트 */}
                <div className="flex-grow-1">
                    <div style={{ fontSize: '0.75rem', color: border, fontWeight: 600, marginBottom: '2px' }}>
                        {label}
                    </div>
                    <div style={{ fontSize: '0.875rem' }}>{message}</div>
                </div>

                {/* 닫기 버튼 */}
                <button
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--bs-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        padding: 0,
                        lineHeight: 1,
                    }}
                >✕</button>
            </div>
        </div>
    );
};

export default Toast;
