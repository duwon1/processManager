/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAuth } from './AuthContext';
import { useAppData } from './AppDataContext';
import { requestRefreshToken, useAuthFetch } from '../hooks/useAuthFetch';
import { getReconnectDelay } from '../utils/stompReconnect';

const NotificationContext = createContext(null);

function mergeNotification(list, notification) {
    if (!notification?.id) return list;
    const next = list.filter(item => item.id !== notification.id);
    return [notification, ...next].slice(0, 50);
}

export function NotificationProvider({ children }) {
    const { accessToken, isAuthenticated, login } = useAuth();
    const authFetch = useAuthFetch();
    const { profile, refreshNodes } = useAppData();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!accessToken || !isAuthenticated) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

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
        } catch {
            // 자동 동기화 실패는 화면 동작을 막지 않습니다.
        }
    }, [accessToken, authFetch, isAuthenticated]);

    useEffect(() => {
        if (!accessToken || !isAuthenticated) {
            const timer = window.setTimeout(() => {
                setNotifications([]);
                setUnreadCount(0);
            }, 0);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [accessToken, isAuthenticated]);

    useEffect(() => {
        const timer = window.setTimeout(refresh, 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    useEffect(() => {
        if (!accessToken || !isAuthenticated) return undefined;

        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        };

        document.addEventListener('visibilitychange', refreshWhenVisible);
        window.addEventListener('focus', refresh);

        return () => {
            document.removeEventListener('visibilitychange', refreshWhenVisible);
            window.removeEventListener('focus', refresh);
        };
    }, [accessToken, isAuthenticated, refresh]);

    // 토큰이 갱신될 때마다 소켓을 다시 만들지 않도록 최신 토큰/콜백은 ref로 참조합니다.
    const accessTokenRef = useRef(accessToken);
    const refreshRef = useRef(refresh);
    const refreshNodesRef = useRef(refreshNodes);
    useEffect(() => {
        accessTokenRef.current = accessToken;
        refreshRef.current = refresh;
        refreshNodesRef.current = refreshNodes;
    }, [accessToken, refresh, refreshNodes]);
    const hasAccessToken = Boolean(accessToken);

    useEffect(() => {
        if (!hasAccessToken || !profile?.id) return undefined;

        let mounted = true;
        let activeClient = null;
        let reconnectTimerId = null;
        let reconnectAttempt = 0;

        const connect = () => {
            const client = new Client({
                webSocketFactory: () => new SockJS('/ws'),
                connectHeaders: { jwt: accessTokenRef.current ?? '' },
                debug: () => {},
                reconnectDelay: 0,
            });
            activeClient = client;

            client.onConnect = () => {
                reconnectAttempt = 0;
                subscribe(client);
            };

            // 고정 간격 대신 지수 백오프 + 지터로 재연결하고, 재연결 전에 새 액세스 토큰을 발급받습니다.
            const scheduleReconnect = () => {
                if (!mounted || activeClient !== client) return;
                activeClient = null;
                client.deactivate().catch(() => {});
                const delay = getReconnectDelay(reconnectAttempt);
                reconnectAttempt += 1;
                clearTimeout(reconnectTimerId);
                reconnectTimerId = setTimeout(async () => {
                    if (!mounted) return;
                    try {
                        const freshToken = await requestRefreshToken();
                        if (!mounted) return;
                        accessTokenRef.current = freshToken;
                        login(freshToken);
                    } catch {
                        // 갱신 실패 시 기존 토큰으로 시도하고, 실패하면 다음 백오프 때 다시 갱신합니다.
                    }
                    if (mounted) connect();
                }, delay);
            };

            client.onStompError = scheduleReconnect;
            client.onWebSocketError = scheduleReconnect;
            client.onWebSocketClose = scheduleReconnect;
            client.activate();
        };

        const subscribe = (client) => {
            refreshRef.current();
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
                    // 실시간 메시지가 깨져도 다음 조회 결과를 기준으로 맞추면 중복 카운트가 남지 않습니다.
                    refreshRef.current();
                }
            });

            // 노드 온/오프라인·신규 등록 이벤트를 받으면 노드 목록을 즉시 다시 조회해 새로고침 없이 갱신합니다.
            client.subscribe(`/topic/user.${profile.id}.nodes`, () => {
                refreshNodesRef.current();
            });
        };

        connect();
        return () => {
            mounted = false;
            clearTimeout(reconnectTimerId);
            activeClient?.deactivate();
        };
    }, [hasAccessToken, profile?.id, login]);

    const markRead = useCallback(async (id) => {
        const target = notifications.find(item => item.id === id);
        if (target && !target.read) {
            // 읽음 처리는 즉시 반영하고, 서버 실패 시 refresh로 원상 동기화합니다.
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

    const deleteAllNotifications = useCallback(async () => {
        setNotifications([]);
        setUnreadCount(0);

        const res = await authFetch('/api/notifications', { method: 'DELETE' });
        if (!res?.ok) {
            refresh();
        }
    }, [authFetch, refresh]);

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        refresh,
        markRead,
        markAllRead,
        deleteAllNotifications,
    }), [deleteAllNotifications, markAllRead, markRead, notifications, refresh, unreadCount]);

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
