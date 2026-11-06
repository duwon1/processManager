import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { useContextMenuDismiss } from '../hooks/useContextMenuDismiss';

// activeState 별 배지 배경색 (ProcessTable의 STATUS_MAP과 동일한 방식)
const STATE_BG = {
    active:       'var(--pm-success)',
    inactive:     'var(--pm-neutral)',
    failed:       'var(--pm-danger)',
    activating:   'var(--pm-warning)',
    deactivating: 'var(--pm-warning)',
};

const STATE_LABEL = {
    active:       '실행 중',
    inactive:     '중지됨',
    failed:       '실패',
    activating:   '시작 중',
    deactivating: '종료 중',
};

// subState 텍스트 색상
const SUB_COLOR = {
    running:  'var(--pm-success)',
    exited:   'var(--pm-text-muted)',
    dead:     'var(--pm-text-muted)',
    failed:   'var(--pm-danger)',
    waiting:  'var(--pm-warning)',
};

const isServiceTargetState = (action, service) => {
    if (!service) return false;
    if (action === 'stop') return service.activeState === 'inactive';
    return service.activeState === 'active';
};

// 현재 activeState에서 허용되는 제어 동작만 반환합니다. 전환 중(activating/deactivating)에는 제어하지 않습니다.
const getServiceActions = (svc) => {
    switch (svc?.activeState) {
        case 'active':
            return [
                { action: 'stop', label: '중지', icon: 'bi-stop-fill', danger: true },
                { action: 'restart', label: '재시작', icon: 'bi-arrow-clockwise', warning: true },
            ];
        case 'activating':
        case 'deactivating':
            return [];
        default:
            return [
                { action: 'start', label: '시작', icon: 'bi-play-fill' },
            ];
    }
};

const CONTEXT_MENU_WIDTH = 190;
const CONTEXT_MENU_HEIGHT = 148;
// 제어 결과가 이 시간 안에 오지 않으면 진행 중 상태를 풀고 사용자에게 알립니다.
const CONTROL_RESULT_TIMEOUT_MS = 15_000;

const isContextMenuKey = (event) => event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');

const clampMenuPosition = (x, y) => {
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    return {
        x: Math.max(8, viewportWidth ? Math.min(x, viewportWidth - CONTEXT_MENU_WIDTH - 8) : x),
        y: Math.max(8, viewportHeight ? Math.min(y, viewportHeight - CONTEXT_MENU_HEIGHT - 8) : y),
    };
};

function Service({ services, isConnected, nodeName, onControl, controlResult, canControlServices = true }) {
    const [search, setSearch]     = useState('');
    const [filter, setFilter]     = useState('all');
    const [contextMenu, setContextMenu] = useState(null);
    const [pendingControls, setPendingControls] = useState({});
    const servicesVersionRef = useRef(0);
    const controlTimersRef = useRef({});
    const menuRef = useRef(null);
    const { showToast } = useToast();

    useEffect(() => {
        servicesVersionRef.current += 1;
    }, [services]);

    useEffect(() => () => {
        Object.values(controlTimersRef.current).forEach(clearTimeout);
    }, []);

    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    useContextMenuDismiss(Boolean(contextMenu), closeContextMenu, {
        menuRef,
        focusKey: contextMenu?.confirmingAction,
    });

    // 대기 중인 제어 요청을 정리하고 결과 대기 타이머도 함께 해제합니다.
    const settleControls = useCallback((names) => {
        names.forEach(name => {
            clearTimeout(controlTimersRef.current[name]);
            delete controlTimersRef.current[name];
        });
        setPendingControls(prev => {
            const next = { ...prev };
            names.forEach(name => {
                delete next[name];
            });
            return next;
        });
    }, []);

    useEffect(() => {
        const completed = Object.entries(pendingControls).filter(([, pending]) => {
            if (!pending?.commandDone) return false;
            if (servicesVersionRef.current <= pending.startedAtVersion) return false;
            const service = services.find(item => item.name === pending.name);
            return isServiceTargetState(pending.action, service);
        });
        if (completed.length === 0) return undefined;

        const timer = setTimeout(() => {
            settleControls(completed.map(([name]) => name));
            completed.forEach(([, pending]) => {
                showToast('success', pending.message || '서비스 상태가 갱신됐습니다.');
            });
        }, 0);
        return () => clearTimeout(timer);
    }, [pendingControls, services, settleControls, showToast]);

    // 제어 결과는 명령 실행 결과입니다. 실제 버튼 상태는 다음 서비스 목록에서 목표 상태가 확인될 때 갱신합니다.
    useEffect(() => {
        if (!controlResult) return;
        const timer = setTimeout(() => {
            if (!controlResult.success) {
                settleControls([controlResult.name]);
                showToast('danger', controlResult.message);
                return;
            }

            setPendingControls(prev => {
                const pending = prev[controlResult.name];
                if (!pending) return prev;
                return {
                    ...prev,
                    [controlResult.name]: {
                        ...pending,
                        commandDone: true,
                        message: controlResult.message,
                    },
                };
            });
        }, 0);
        return () => clearTimeout(timer);
    }, [controlResult, settleControls, showToast]);

    const handleControl = useCallback((name, action) => {
        if (!canControlServices) return;
        setContextMenu(null);
        // 연결이 끊겨 전송하지 못했으면 진행 중 상태를 만들지 않습니다.
        if (!onControl(name, action)) {
            showToast('danger', '서버와 연결되어 있지 않아 서비스 제어 요청을 보내지 못했습니다.');
            return;
        }

        clearTimeout(controlTimersRef.current[name]);
        controlTimersRef.current[name] = setTimeout(() => {
            delete controlTimersRef.current[name];
            setPendingControls(prev => {
                if (!prev[name]) return prev;
                const next = { ...prev };
                delete next[name];
                return next;
            });
            showToast('warning', '결과를 확인하지 못했습니다');
        }, CONTROL_RESULT_TIMEOUT_MS);

        setPendingControls(prev => ({
            ...prev,
            [name]: {
                name,
                action,
                commandDone: false,
                startedAtVersion: servicesVersionRef.current,
                message: '',
            },
        }));
    }, [canControlServices, onControl, showToast]);

    const counts = useMemo(() => ({
        all:      services.length,
        active:   services.filter(s => s.activeState === 'active').length,
        inactive: services.filter(s => s.activeState === 'inactive').length,
        failed:   services.filter(s => s.activeState === 'failed').length,
    }), [services]);

    const rows = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return services.filter(s => {
            const matchSearch = !kw ||
                String(s.name ?? '').toLowerCase().includes(kw) ||
                String(s.description ?? '').toLowerCase().includes(kw);
            const matchFilter = filter === 'all' || s.activeState === filter;
            return matchSearch && matchFilter;
        });
    }, [services, search, filter]);

    const canOpenMenuFor = (svc) => canControlServices && !pendingControls[svc.name];

    const openContextMenuAt = (position, svc) => {
        setContextMenu({
            ...clampMenuPosition(position.x, position.y),
            service: svc,
            confirmingAction: '',
        });
    };

    const openContextMenu = (event, svc) => {
        if (!canOpenMenuFor(svc)) return;
        event.preventDefault();
        // 키보드로 발생한 contextmenu 이벤트는 좌표가 0이므로 행 위치를 기준으로 엽니다.
        if (event.clientX === 0 && event.clientY === 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            openContextMenuAt({ x: rect.left + 16, y: rect.bottom }, svc);
            return;
        }
        openContextMenuAt({ x: event.clientX, y: event.clientY }, svc);
    };

    // ContextMenu 키 / Shift+F10으로 행(또는 행 안의 ⋯ 버튼)에서 메뉴를 엽니다.
    const handleRowKeyDown = (event, svc) => {
        if (!isContextMenuKey(event) || !canOpenMenuFor(svc)) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        openContextMenuAt({ x: rect.left + 16, y: rect.bottom }, svc);
    };

    const openActionMenu = (event, svc) => {
        // 버튼 click이 window까지 전파되면 방금 연 메뉴가 바로 닫히므로 막습니다.
        event.stopPropagation();
        if (!canOpenMenuFor(svc)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        openContextMenuAt({ x: rect.right - CONTEXT_MENU_WIDTH, y: rect.bottom + 4 }, svc);
    };

    const renderRowAction = (svc) => canControlServices && (
        <button
            type="button"
            className="pm-manager-row-action"
            aria-label={`${svc.name} 작업 메뉴`}
            aria-haspopup="menu"
            disabled={Boolean(pendingControls[svc.name])}
            onClick={(event) => openActionMenu(event, svc)}
        >
            ⋯
        </button>
    );

    const rowHandlers = (svc) => ({
        tabIndex: canControlServices ? -1 : undefined,
        onContextMenu: (event) => openContextMenu(event, svc),
        onKeyDown: (event) => handleRowKeyDown(event, svc),
    });

    const requestServiceAction = (action) => {
        setContextMenu(prev => prev ? { ...prev, confirmingAction: action } : prev);
    };

    const confirmServiceAction = () => {
        if (!contextMenu?.service || !contextMenu.confirmingAction) return;
        const { name } = contextMenu.service;
        const action = contextMenu.confirmingAction;
        // 메뉴를 연 뒤 서비스 상태가 바뀌었을 수 있으므로 확인 시점의 최신 상태로 허용 동작을 다시 판단합니다.
        const latest = services.find(item => item.name === name);
        if (!latest) {
            setContextMenu(null);
            showToast('warning', `${name} 서비스를 목록에서 찾을 수 없어 요청을 취소했습니다.`);
            return;
        }
        if (!getServiceActions(latest).some(item => item.action === action)) {
            setContextMenu(null);
            showToast('warning', `${name} 서비스 상태가 '${STATE_LABEL[latest.activeState] ?? latest.activeState}'(으)로 바뀌어 요청을 취소했습니다.`);
            return;
        }
        handleControl(name, action);
    };

    return (
        <section className="pm-manager-shell d-flex flex-column gap-3 overflow-y-hidden">
            {/* ── 툴바 ── */}
            <div className="pm-manager-toolbar d-flex flex-column gap-2 flex-shrink-0">
                <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
                    <div className="pm-manager-heading">
                        <h5 className="pm-manager-title">서비스 관리자</h5>
                        <small className="pm-manager-subtitle">
                            {isConnected ? '실시간 연결 중' : '연결 대기 중'}
                            {nodeName && <> &nbsp;·&nbsp; {nodeName}</>}
                        </small>
                    </div>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control form-control-sm pm-manager-search"
                        placeholder="서비스명 · 설명"
                    />
                </div>

                {/* 상태 필터 + 카운트 */}
                <div className="pm-manager-actionbar d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div className="pm-filter-group d-flex gap-1 flex-nowrap">
                        {[
                            { key: 'all',      label: `전체 ${counts.all}` },
                            { key: 'active',   label: `실행 중 ${counts.active}` },
                            { key: 'inactive', label: `중지됨 ${counts.inactive}` },
                            { key: 'failed',   label: `실패 ${counts.failed}` },
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                className={`pm-filter-chip ${filter === key ? 'pm-filter-chip-active' : ''}`}
                                onClick={() => setFilter(key)}
                            >{label}</button>
                        ))}
                    </div>
                    <small className="pm-manager-count">
                        표시 중 <strong>{rows.length}개</strong>
                    </small>
                </div>
            </div>

            {/* ── 빈 상태 ── */}
            {rows.length === 0 && (
                <div className="pm-manager-empty">
                    {services.length === 0
                        ? '서비스 데이터 수신 대기 중입니다.'
                        : '검색 조건에 맞는 서비스가 없습니다.'}
                </div>
            )}

            {/* ── 데스크톱 테이블 ── */}
            {rows.length > 0 && (
                <div className="pm-manager-table-frame d-none d-lg-flex flex-column flex-grow-1">
                    <div className="flex-grow-1" style={{ overflowY: 'auto', overflowX: 'auto' }}>
                        <table
                            className="table table-hover align-middle mb-0 pm-manager-table"
                        >
                            <thead className="pm-manager-thead">
                                <tr>
                                    {[
                                        { label: '서비스명', style: { minWidth: 220 } },
                                        { label: '상태',     style: { width: 90 } },
                                        { label: '세부',     style: { width: 90 } },
                                        { label: '설명',     style: {} },
                                    ].map(({ label, style }) => (
                                        <th
                                            key={label}
                                            className="pm-manager-th"
                                            style={style}
                                        >{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(svc => (
                                    <tr
                                        key={svc.name}
                                        className={canControlServices ? 'pm-manager-context-row' : ''}
                                        {...rowHandlers(svc)}
                                    >
                                        <td>
                                            <div className="d-flex align-items-center gap-1" style={{ maxWidth: 280 }}>
                                                <div className="pm-manager-name text-truncate flex-grow-1"
                                                    title={svc.name}>
                                                    {svc.name}
                                                </div>
                                                {renderRowAction(svc)}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className="pm-status-badge"
                                                style={{
                                                    backgroundColor: STATE_BG[svc.activeState] ?? 'var(--pm-neutral)',
                                                }}
                                            >
                                                {STATE_LABEL[svc.activeState] ?? svc.activeState}
                                            </span>
                                        </td>
                                        <td style={{ color: SUB_COLOR[svc.subState] ?? 'var(--pm-text-muted)', fontSize: '0.8rem' }}>
                                            {svc.subState}
                                        </td>
                                        <td className="pm-manager-muted text-truncate" style={{ maxWidth: 300, fontSize: '0.8rem' }}
                                            title={svc.description}>
                                            {svc.description}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 모바일 카드 ── */}
            {rows.length > 0 && (
                <div className="pm-manager-mobile-list d-flex d-lg-none flex-column gap-2 overflow-y-auto flex-grow-1">
                    {rows.map(svc => (
                        <div
                            key={`${svc.name}-m`}
                            className="pm-manager-card card"
                            {...rowHandlers(svc)}
                        >
                            <div className="card-body py-2 px-3">
                                <div className="d-flex align-items-start gap-1">
                                    <div className="pm-manager-name flex-grow-1">{svc.name}</div>
                                    {renderRowAction(svc)}
                                </div>
                                <small className="pm-manager-muted d-block mb-1">{svc.description}</small>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                    <span
                                        className="pm-status-badge"
                                        style={{
                                            backgroundColor: STATE_BG[svc.activeState] ?? 'var(--pm-neutral)',
                                        }}
                                    >
                                        {STATE_LABEL[svc.activeState] ?? svc.activeState}
                                    </span>
                                    <span style={{ color: SUB_COLOR[svc.subState] ?? 'var(--pm-text-muted)', fontSize: '0.78rem' }}>
                                        {svc.subState}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {contextMenu && (
                <div
                    ref={menuRef}
                    className="pm-manager-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    role="menu"
                    aria-label={`${contextMenu.service.name} 작업`}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <div className="pm-manager-context-title text-truncate">{contextMenu.service.name}</div>
                    {contextMenu.confirmingAction ? (
                        <div className="pm-manager-context-confirm">
                            <span>{getServiceActions(contextMenu.service).find(item => item.action === contextMenu.confirmingAction)?.label}할까요?</span>
                            <div>
                                <button type="button" className="pm-manager-context-danger" onClick={confirmServiceAction}>확인</button>
                                {/* 실수로 Enter를 두 번 눌러 실행되지 않도록 확인 단계에서는 취소에 포커스를 둡니다. */}
                                <button type="button" data-autofocus onClick={closeContextMenu}>취소</button>
                            </div>
                        </div>
                    ) : getServiceActions(contextMenu.service).length === 0 ? (
                        <div className="pm-manager-context-confirm">
                            <span>상태 전환 중에는 제어할 수 없습니다.</span>
                        </div>
                    ) : (
                        getServiceActions(contextMenu.service).map(item => (
                            <button
                                key={item.action}
                                type="button"
                                className={item.danger ? 'pm-manager-context-danger' : item.warning ? 'pm-manager-context-warning' : ''}
                                role="menuitem"
                                onClick={() => requestServiceAction(item.action)}
                            >
                                <i className={`bi ${item.icon}`} aria-hidden="true"></i>
                                {item.label}
                            </button>
                        ))
                    )}
                </div>
            )}
        </section>
    );
}

export default Service;
