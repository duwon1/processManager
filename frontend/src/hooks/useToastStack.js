import { useCallback, useEffect, useRef, useState } from 'react';

export function useToastStack({ limit = 4, duration = 3000 } = {}) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
        const timer = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 300);
        timersRef.current.push(timer);
    }, []);

    const showToast = useCallback((typeOrToast, message) => {
        const options = typeof typeOrToast === 'object'
            ? typeOrToast
            : { type: typeOrToast, message };
        const id = options.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const toast = {
            id,
            type: options.type ?? 'info',
            title: options.title,
            message: options.message ?? '',
            visible: false,
        };

        // 화면 전체에서 쓰는 알림 스택을 한 곳에서 관리해 중복 타이머 구현을 줄입니다.
        setToasts(prev => [...prev, toast].slice(-limit));

        const showTimer = setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
        }, 10);
        const hideTimer = setTimeout(() => removeToast(id), options.duration ?? duration);
        timersRef.current.push(showTimer, hideTimer);
        return id;
    }, [duration, limit, removeToast]);

    const clearToasts = useCallback(() => {
        setToasts(prev => prev.map(t => ({ ...t, visible: false })));
        const timer = setTimeout(() => setToasts([]), 300);
        timersRef.current.push(timer);
    }, []);

    useEffect(() => {
        return () => {
            timersRef.current.forEach(clearTimeout);
            timersRef.current = [];
        };
    }, []);

    return { toasts, showToast, removeToast, clearToasts };
}
