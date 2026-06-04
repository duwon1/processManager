import React from 'react';

const TOAST_ICON = {
    success: 'bi-check2-circle',
    danger: 'bi-exclamation-octagon',
    warning: 'bi-exclamation-triangle',
    info: 'bi-info-circle',
};

function ToastCard({ toast, onDismiss }) {
    const requestedType = toast.type ?? 'info';
    const type = TOAST_ICON[requestedType] ? requestedType : 'info';
    const icon = TOAST_ICON[type] ?? TOAST_ICON.info;

    return (
        <div
            className={`toast show app-toast app-toast-${type}`}
            role="alert"
            style={{
                overflowX: 'hidden',
                overflowY: toast.visible ? 'auto' : 'hidden',
                opacity: toast.visible ? 1 : 0,
                maxHeight: toast.visible ? 'min(70vh, 520px)' : '0',
                marginBottom: toast.visible ? '8px' : '0',
                transform: toast.visible ? 'translateY(0)' : 'translateY(-8px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease, max-height 0.35s ease 0.15s, margin-bottom 0.35s ease 0.15s',
            }}
        >
            <div className="app-toast-body">
                <span className="app-toast-icon">
                    <i className={`bi ${icon}`} />
                </span>
                <span className="app-toast-copy">
                    {toast.title && <span className="app-toast-title">{toast.title}</span>}
                    <span className={toast.title ? 'app-toast-message' : 'app-toast-message app-toast-message-standalone'}>
                        {toast.message}
                    </span>
                </span>
                <button
                    type="button"
                    className="app-toast-close"
                    aria-label="알림 닫기"
                    onClick={() => onDismiss?.(toast.id)}
                >
                    <i className="bi bi-x-lg" />
                </button>
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
