import React from 'react';

const TOAST_ICON = {
    success: '✓',
    danger: '✕',
    warning: '⚠',
    info: 'ℹ',
};

export function ToastCard({ toast, onDismiss }) {
    const type = toast.type ?? 'info';
    const icon = TOAST_ICON[type] ?? TOAST_ICON.info;

    return (
        <div
            className={`toast show text-bg-${type} border-0 shadow-lg`}
            role="alert"
            style={{
                minWidth: '280px',
                maxWidth: '360px',
                overflow: 'hidden',
                opacity: toast.visible ? 1 : 0,
                maxHeight: toast.visible ? '120px' : '0',
                marginBottom: toast.visible ? '8px' : '0',
                transform: toast.visible ? 'translateY(0)' : 'translateY(-8px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease, max-height 0.35s ease 0.15s, margin-bottom 0.35s ease 0.15s',
            }}
        >
            <div className="d-flex align-items-center px-3 py-3 gap-2">
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <span className="me-auto" style={{ minWidth: 0 }}>
                    {toast.title && <span className="d-block fw-semibold text-truncate">{toast.title}</span>}
                    <span className={`d-block ${toast.title ? 'small' : 'fw-semibold'}`}>{toast.message}</span>
                </span>
                <button
                    type="button"
                    className="btn-close btn-close-white ms-1"
                    aria-label="알림 닫기"
                    onClick={() => onDismiss?.(toast.id)}
                />
            </div>
        </div>
    );
}

function ToastStack({ toasts, onDismiss, zIndex = 9999 }) {
    if (!toasts?.length) return null;

    return (
        <div className="position-fixed top-0 end-0 p-3 d-flex flex-column gap-2" style={{ zIndex }}>
            {toasts.map(toast => (
                <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

export default ToastStack;
