/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from './AuthContext';
import { useAuthFetch } from '../hooks/useAuthFetch';

const NotificationContext = createContext(null);

function mergeNotification(list, notification) {
    if (!notification?.id) return list;
    const next = list.filter(item => item.id !== notification.id);
    return [notification, ...next].slice(0, 50);
}

export function NotificationProvider({ children }) {
    const { accessToken, isAuthenticated } = useAuth();
    const authFetch = useAuthFetch();
    const [profile, setProfile] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!accessToken || !isAuthenticated) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        setLoading(true);
        try {
            const [listRes, countRes] = await Promise.all([
                authFetch('/api/notifications?limit=50'),
                authFetch('/api/notifications/unread-count'),
            ]);

            if (listRes?.ok) {
                setNotifications(await listRes.json());
            }
            if (countRes?.ok) {
                const data = await countRes.json();
                setUnreadCount(Number(data.count) || 0);
            }
        } finally {
            setLoading(false);
        }
    }, [accessToken, authFetch, isAuthenticated]);

    useEffect(() => {
        if (!accessToken || !isAuthenticated) {
            setProfile(null);
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        let alive = true;
        authFetch('/api/user/me')
            .then(res => res?.ok ? res.json() : null)
            .then(data => {
                if (alive) setProfile(data);
            })
            .catch(() => {
                if (alive) setProfile(null);
            });

        return () => {
            alive = false;
        };
    }, [accessToken, authFetch, isAuthenticated]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!accessToken || !profile?.id) return undefined;

        const client = new Client({
            webSocketFactory: () => new SockJS('/ws'),
            connectHeaders: { jwt: accessToken },
            debug: () => {},
            reconnectDelay: 5000,
        });

        client.onConnect = () => {
            client.subscribe(`/topic/user.${profile.id}.notifications`, (frame) => {
                try {
                    const payload = JSON.parse(frame.body);
                    if (payload.type === 'created' && payload.notification) {
                        setNotifications(prev => {
                            const existing = prev.find(item => item.id === payload.notification.id);
                            if (!payload.notification.read && (!existing || existing.read)) {
                                setUnreadCount(count => count + 1);
                            }
                            return mergeNotification(prev, payload.notification);
                        });
                    } else if (payload.type === 'unread-count') {
                        setUnreadCount(Number(payload.count) || 0);
                    }
                } catch {
                    refresh();
                }
            });
        };

        client.activate();
        return () => {
            client.deactivate();
        };
    }, [accessToken, profile?.id, refresh]);

    const markRead = useCallback(async (id) => {
        const target = notifications.find(item => item.id === id);
        if (target && !target.read) {
            setNotifications(prev => prev.map(item => item.id === id ? { ...item, read: true, readAt: new Date().toISOString() } : item));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        const res = await authFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
        if (res?.ok) {
            const updated = await res.json();
            setNotifications(prev => prev.map(item => item.id === id ? updated : item));
        } else {
            refresh();
        }
    }, [authFetch, notifications, refresh]);

    const markAllRead = useCallback(async () => {
        setNotifications(prev => prev.map(item => ({ ...item, read: true, readAt: item.readAt ?? new Date().toISOString() })));
        setUnreadCount(0);

        const res = await authFetch('/api/notifications/read-all', { method: 'PATCH' });
        if (!res?.ok) {
            refresh();
        }
    }, [authFetch, refresh]);

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        loading,
        refresh,
        markRead,
        markAllRead,
    }), [loading, markAllRead, markRead, notifications, refresh, unreadCount]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications는 NotificationProvider 안에서만 사용할 수 있습니다.');
    }
    return context;
}
