import React, { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../context/NotificationContext';

const SEVERITY_META = {
    danger: { icon: 'bi-exclamation-octagon', color: 'text-danger' },
    warning: { icon: 'bi-exclamation-triangle', color: 'text-warning' },
    success: { icon: 'bi-check-circle', color: 'text-success' },
    info: { icon: 'bi-info-circle', color: 'text-info' },
};

function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function NotificationItem({ notification, onOpen }) {
    const meta = SEVERITY_META[notification.severity] ?? SEVERITY_META.info;
    return (
        <button
            type="button"
            className={`notification-item ${notification.read ? 'notification-item-read' : ''}`}
            onClick={() => onOpen(notification)}
        >
            <span className={`notification-item-icon ${meta.color}`}>
                <i className={`bi ${meta.icon}`} />
            </span>
            <span className="notification-item-body">
                <span className="notification-item-title">{notification.title}</span>
                <span className="notification-item-message">{notification.message}</span>
                <span className="notification-item-time">{formatTime(notification.createdAt)}</span>
            </span>
            {!notification.read && <span className="notification-item-dot" />}
        </button>
    );
}

function NotificationBell() {
    const { notifications, unreadCount, markRead, markAllRead, deleteAllNotifications, refresh } = useNotifications();
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOpenNotification = async (notification) => {
        if (!notification.read) {
            await markRead(notification.id);
        }
        setOpen(false);
    };

    const handleDeleteAll = async () => {
        await deleteAllNotifications();
    };

    return (
        <div className="notification-bell" ref={panelRef}>
            <button
                type="button"
                className="btn btn-dark btn-sm rounded-circle notification-bell-button"
                onClick={() => {
                    setOpen(prev => {
                        const next = !prev;
                        if (next) refresh();
                        return next;
                    });
                }}
                aria-label="알림"
            >
                <i className="bi bi-bell" />
                {unreadCount > 0 && (
                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger notification-bell-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="notification-panel bg-dark border border-secondary shadow-lg">
                    <div className="notification-panel-header">
                        <div>
                            <div className="fw-semibold text-light">알림</div>
                            <small className="text-secondary">{unreadCount > 0 ? `읽지 않음 ${unreadCount}개` : '새 알림 없음'}</small>
                        </div>
                        <div className="d-flex align-items-center gap-1">
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-info notification-read-all"
                                onClick={markAllRead}
                                disabled={unreadCount === 0}
                            >
                                모두 읽음
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger notification-delete-all"
                                onClick={handleDeleteAll}
                                disabled={notifications.length === 0}
                            >
                                전체 삭제
                            </button>
                        </div>
                    </div>

                    <div className="notification-panel-list">
                        {notifications.length === 0 ? (
                            <div className="notification-empty text-secondary">
                                확인할 알림이 없습니다.
                            </div>
                        ) : (
                            notifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onOpen={handleOpenNotification}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default NotificationBell;
