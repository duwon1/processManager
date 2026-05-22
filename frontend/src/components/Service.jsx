import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../context/ToastContext';

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
    inactive:     '중지',
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

function Service({ services, isConnected, nodeName, onControl, controlResult, canControlServices = true }) {
    const [search, setSearch]     = useState('');
    const [filter, setFilter]     = useState('all');
    const [confirmSvc, setConfirmSvc] = useState(null); // { name, action }
    const [pendingControls, setPendingControls] = useState({});
    const servicesVersionRef = useRef(0);
    const { showToast } = useToast();

    useEffect(() => {
        servicesVersionRef.current += 1;
    }, [services]);

    useEffect(() => {
        const completed = Object.entries(pendingControls).filter(([, pending]) => {
            if (!pending?.commandDone) return false;
            if (servicesVersionRef.current <= pending.startedAtVersion) return false;
            const service = services.find(item => item.name === pending.name);
            return isServiceTargetState(pending.action, service);
        });
        if (completed.length === 0) return undefined;

        const timer = setTimeout(() => {
            setPendingControls(prev => {
                const next = { ...prev };
                completed.forEach(([name]) => {
                    delete next[name];
                });
                return next;
            });
            completed.forEach(([, pending]) => {
                showToast('success', pending.message || '서비스 상태가 갱신됐습니다.');
            });
        }, 0);
        return () => clearTimeout(timer);
    }, [pendingControls, services, showToast]);

    // 제어 결과는 명령 실행 결과입니다. 실제 버튼 상태는 다음 서비스 목록에서 목표 상태가 확인될 때 갱신합니다.
    useEffect(() => {
        if (!controlResult) return;
        const timer = setTimeout(() => {
            if (!controlResult.success) {
                setPendingControls(prev => {
                    const next = { ...prev };
                    delete next[controlResult.name];
                    return next;
                });
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
    }, [controlResult, showToast]);

    const handleControl = useCallback((name, action) => {
        if (!canControlServices) return;
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
        setConfirmSvc(null);
        onControl(name, action);
    }, [canControlServices, onControl]);

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

    const renderControl = (svc) => {
        const isPending = Boolean(pendingControls[svc.name]);
        const isConfirming = confirmSvc?.name === svc.name;
        const isActive = svc.activeState === 'active';

        if (isPending) {
            return <span className="spinner-border spinner-border-sm text-info" />;
        }

        if (isConfirming) {
            return (
                <div className="pm-manager-control-group d-flex gap-1">
                    <button
                        className="btn btn-danger btn-sm pm-manager-btn"
                        onClick={() => handleControl(confirmSvc.name, confirmSvc.action)}
                    >확인</button>
                    <button
                        className="btn btn-secondary btn-sm pm-manager-btn"
                        onClick={() => setConfirmSvc(null)}
                    >취소</button>
                </div>
            );
        }

        return (
            <div className="pm-manager-control-group d-flex gap-1 flex-nowrap">
                {!isActive && (
                    <button
                        className="btn btn-outline-success btn-sm pm-manager-btn flex-shrink-0"
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'start' })}
                    >시작</button>
                )}
                {isActive && (
                    <button
                        className="btn btn-outline-danger btn-sm pm-manager-btn flex-shrink-0"
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'stop' })}
                    >중지</button>
                )}
                {isActive && (
                    <button
                        className="btn btn-outline-warning btn-sm pm-manager-btn flex-shrink-0"
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'restart' })}
                    >재시작</button>
                )}
            </div>
        );
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
                            { key: 'inactive', label: `중지 ${counts.inactive}` },
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
                                        ...(canControlServices ? [
                                            { label: '제어', style: { width: 160, textAlign: 'center' } },
                                        ] : []),
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
                                    <tr key={svc.name}>
                                        <td>
                                            <div className="pm-manager-name text-truncate" style={{ maxWidth: 280 }}
                                                title={svc.name}>
                                                {svc.name}
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
                                        {canControlServices && (
                                            <td className="text-center">
                                                {renderControl(svc)}
                                            </td>
                                        )}
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
                        <div key={`${svc.name}-m`} className="pm-manager-card card">
                            <div className="card-body py-2 px-3">
                                <div className="pm-manager-name">{svc.name}</div>
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
                                    {canControlServices && (
                                        <div className="ms-auto">
                                            {renderControl(svc)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default Service;
