import React, { useEffect } from 'react';

const Toast = ({ message, onClose }) => {
    useEffect(() => {
        // 3초 뒤에 자동으로 onClose 실행 (부모의 상태를 바꿈)
        const timer = setTimeout(() => {
            onClose();
        }, 3000);

        return () => clearTimeout(timer); // 컴포넌트가 사라지면 타이머 정리
    }, [onClose]);

    return (
        // position-fixed와 top-0 end-0으로 오른쪽 상단 고정
        <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
            <div className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
                <div className="toast-header bg-danger text-white">
                    <strong className="me-auto">알림</strong>
                    <button
                        type="button"
                        className="btn-close btn-close-white"
                        onClick={onClose}
                    ></button>
                </div>
                <div className="toast-body bg-danger">
                    {message}
                </div>
            </div>
        </div>
    );
};

export default Toast;