import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Toast from './Toast';

// activeState 별 배지 배경색 (ProcessTable의 STATUS_MAP과 동일한 방식)
const STATE_BG = {
    active:       'var(--bs-success)',
    inactive:     'var(--bs-secondary)',
    failed:       'var(--bs-danger)',
    activating:   'var(--bs-warning)',
    deactivating: 'var(--bs-warning)',
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
    running:  'var(--bs-success)',
    exited:   'var(--bs-secondary)',
    dead:     'var(--bs-secondary)',
    failed:   'var(--bs-danger)',
    waiting:  'var(--bs-warning)',
};

function Service({ services, isConnected, nodeName, onControl, controlResult }) {
    const [search, setSearch]     = useState('');
    const [filter, setFilter]     = useState('all');
    const [confirmSvc, setConfirmSvc] = useState(null); // { name, action }
    const [pendingSet, setPendingSet] = useState(new Set());
    const [toast, setToast]       = useState(null);

    // 제어 결과 수신 시 pending 해제 + toast
    useEffect(() => {
        if (!controlResult) return;
        setPendingSet(prev => {
            const s = new Set(prev);
            s.delete(controlResult.name);
            return s;
        });
        setToast({
            message: controlResult.message,
            type: controlResult.success ? 'success' : 'danger',
        });
    }, [controlResult]);

    const handleControl = useCallback((name, action) => {
        setPendingSet(prev => new Set(prev).add(name));
        setConfirmSvc(null);
        onControl(name, action);
    }, [onControl]);

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
                s.name.toLowerCase().includes(kw) ||
                s.description.toLowerCase().includes(kw);
            const matchFilter = filter === 'all' || s.activeState === filter;
            return matchSearch && matchFilter;
        });
    }, [services, search, filter]);

    if (!isConnected) {
        return (
            <div className="text-center mt-5 text-secondary">
                <div className="spinner-border mb-3 text-info" role="status"></div>
                <h5>서버 연결 시도 중...</h5>
            </div>
        );
    }

    const renderControl = (svc) => {
        const isPending = pendingSet.has(svc.name);
        const isConfirming = confirmSvc?.name === svc.name;
        const isActive = svc.activeState === 'active';

        if (isPending) {
            return <span className="spinner-border spinner-border-sm text-info" />;
        }

        if (isConfirming) {
            return (
                <div className="d-flex gap-1">
                    <button
                        className="btn btn-danger btn-sm py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => handleControl(confirmSvc.name, confirmSvc.action)}
                    >확인</button>
                    <button
                        className="btn btn-secondary btn-sm py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setConfirmSvc(null)}
                    >취소</button>
                </div>
            );
        }

        return (
            <div className="d-flex gap-1 flex-wrap">
                {!isActive && (
                    <button
                        className="btn btn-outline-success btn-sm py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'start' })}
                    >시작</button>
                )}
                {isActive && (
                    <button
                        className="btn btn-outline-danger btn-sm py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'stop' })}
                    >중지</button>
                )}
                {isActive && (
                    <button
                        className="btn btn-outline-warning btn-sm py-0 px-2"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setConfirmSvc({ name: svc.name, action: 'restart' })}
                    >재시작</button>
                )}
            </div>
        );
    };

    return (
        <section className="d-flex flex-column gap-3 overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* ── 툴바 ── */}
            <div className="d-flex flex-column gap-2 flex-shrink-0">
                <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
                    <div>
                        <h5 className="mb-0 text-info">서비스 관리자</h5>
                        <small className="text-white-50">
                            {isConnected ? '실시간 연결 중' : '연결 대기 중'}
                            {nodeName && <> &nbsp;·&nbsp; {nodeName}</>}
                        </small>
                    </div>
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control form-control-sm"
                        placeholder="서비스명 · 설명"
                        style={{ maxWidth: '240px' }}
                    />
                </div>

                {/* 상태 필터 + 카운트 */}
                <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div className="d-flex gap-1 flex-wrap">
                        {[
                            { key: 'all',      label: `전체 ${counts.all}` },
                            { key: 'active',   label: `실행 중 ${counts.active}` },
                            { key: 'inactive', label: `중지 ${counts.inactive}` },
                            { key: 'failed',   label: `실패 ${counts.failed}` },
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                className={`btn btn-sm py-0 px-2 ${filter === key ? 'btn-info' : 'btn-outline-secondary'}`}
                                style={{ fontSize: '0.75rem' }}
                                onClick={() => setFilter(key)}
                            >{label}</button>
                        ))}
                    </div>
                    <small className="text-white-50">
                        표시 중 <span className="text-info fw-semibold">{rows.length}개</span>
                    </small>
                </div>
            </div>

            {/* ── 빈 상태 ── */}
            {rows.length === 0 && (
                <div className="text-center py-5 text-white-50 border border-secondary border-opacity-25 rounded-3">
                    {services.length === 0
                        ? '서비스 데이터 수신 대기 중입니다.'
                        : '검색 조건에 맞는 서비스가 없습니다.'}
                </div>
            )}

            {/* ── 데스크톱 테이블 ── */}
            {rows.length > 0 && (
                <div className="d-none d-lg-flex flex-column flex-grow-1 rounded-3 overflow-hidden" style={{ border: '1px solid var(--bs-primary)' }}>
                    <div className="overflow-y-auto flex-grow-1">
                        <table
                            className="table table-hover align-middle mb-0"
                            style={{ fontSize: '0.84rem', backgroundColor: 'var(--bs-dark)' }}
                        >
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr className="border-bottom border-secondary">
                                    {[
                                        { label: '서비스명', style: { minWidth: 220 } },
                                        { label: '상태',     style: { width: 90 } },
                                        { label: '세부',     style: { width: 90 } },
                                        { label: '설명',     style: {} },
                                        { label: '제어',     style: { width: 160, textAlign: 'center', borderRight: '2px solid rgba(255,255,255,0.15)' } },
                                    ].map(({ label, style }) => (
                                        <th
                                            key={label}
                                            className="fw-semibold small"
                                            style={{
                                                backgroundColor: 'var(--bs-dark)',
                                                color: 'var(--bs-body-color)',
                                                whiteSpace: 'nowrap',
                                                ...style,
                                            }}
                                        >{label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(svc => (
                                    <tr key={svc.name}>
                                        <td>
                                            <div className="text-white fw-semibold text-truncate" style={{ maxWidth: 280 }}
                                                title={svc.name}>
                                                {svc.name}
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className="badge"
                                                style={{
                                                    backgroundColor: STATE_BG[svc.activeState] ?? 'var(--bs-secondary)',
                                                    color: 'var(--bs-white)',
                                                    fontSize: '0.72rem',
                                                }}
                                            >
                                                {STATE_LABEL[svc.activeState] ?? svc.activeState}
                                            </span>
                                        </td>
                                        <td style={{ color: SUB_COLOR[svc.subState] ?? 'var(--bs-secondary)', fontSize: '0.8rem' }}>
                                            {svc.subState}
                                        </td>
                                        <td className="text-white-50 text-truncate" style={{ maxWidth: 300, fontSize: '0.8rem' }}
                                            title={svc.description}>
                                            {svc.description}
                                        </td>
                                        <td className="text-center">
                                            {renderControl(svc)}
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
                <div className="d-flex d-lg-none flex-column gap-2 overflow-y-auto flex-grow-1">
                    {rows.map(svc => (
                        <div key={`${svc.name}-m`} className="card bg-dark border-secondary border-opacity-25">
                            <div className="card-body py-2 px-3">
                                <div className="text-white fw-semibold">{svc.name}</div>
                                <small className="text-white-50 d-block mb-1">{svc.description}</small>
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                    <span
                                        className="badge"
                                        style={{
                                            backgroundColor: STATE_BG[svc.activeState] ?? 'var(--bs-secondary)',
                                            color: 'var(--bs-white)',
                                            fontSize: '0.72rem',
                                        }}
                                    >
                                        {STATE_LABEL[svc.activeState] ?? svc.activeState}
                                    </span>
                                    <span style={{ color: SUB_COLOR[svc.subState] ?? 'var(--bs-secondary)', fontSize: '0.78rem' }}>
                                        {svc.subState}
                                    </span>
                                    <div className="ms-auto">
                                        {renderControl(svc)}
                                    </div>
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
