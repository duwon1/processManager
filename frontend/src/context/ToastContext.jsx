/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo } from 'react';
import ToastStack from '../components/ToastStack';
import { useToastStack } from '../hooks/useToastStack';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const { toasts, showToast, removeToast, clearToasts } = useToastStack({ limit: 5 });
    const value = useMemo(() => ({ showToast, removeToast, clearToasts }), [showToast, removeToast, clearToasts]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            {/* 앱 전역 알림을 하나의 스택에서 렌더링해 페이지별 토스트가 서로 겹치지 않게 합니다. */}
            <ToastStack toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast는 ToastProvider 안에서만 사용할 수 있습니다.');
    }
    return context;
}
