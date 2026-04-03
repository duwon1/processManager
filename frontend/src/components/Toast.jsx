import React, { useEffect } from 'react';

// type: 'success' | 'danger' | 'warning'
const Toast = ({ message, type = 'danger', onClose }) => {
    // onClose ref를 통해 항상 최신 함수를 참조합니다.
    // 의존성을 []로 유지해 렌더링마다 타이머가 리셋되는 문제를 방지합니다.
    const onCloseRef = React.useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        // 3초 뒤 자동으로 닫힙니다.
        const timer = setTimeout(() => onCloseRef.current(), 3000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="toast-container position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
            <div className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
                <div className={`toast-header bg-${type} text-white`}>
                    <strong className="me-auto">
                        {type === 'success' ? '✓ 성공' : type === 'warning' ? '⚠ 경고' : '✕ 오류'}
                    </strong>
                    <button type="button" className="btn-close btn-close-white" onClick={onClose} />
                </div>
                <div className={`toast-body bg-${type} text-white`}>
                    {message}
                </div>
            </div>
        </div>
    );
};

export default Toast;
