import React, { useDeferredValue, useState, useRef, useCallback, useMemo, useEffect, forwardRef } from 'react';
import Toast from './Toast';
import './ProcessTable.css';

// 숫자 필드가 비어 있거나 문자열이어도 안전하게 숫자로 변환합니다.
const toSafeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

// 컬럼 정의입니다. width는 초기 px 값이며 드래그로 변경됩니다.
const COLUMNS = [
    { key: 'pid',            label: 'PID',      width: 70  },
    { key: 'username',       label: '사용자',    width: 90  },
    { key: 'status',         label: '상태',      width: 90  },
    { key: 'cpu_percent',    label: 'CPU',       width: 80  },
    { key: 'memory_mb',      label: '메모리',    width: 110 },
    { key: 'memory_percent', label: '메모리 %',  width: 90  },
    { key: 'disk_read_mb',   label: '읽기',      width: 100 },
    { key: 'disk_write_mb',  label: '쓰기',      width: 100 },
    { key: 'thread_count',   label: '스레드',    width: 75  },
];
const NAME_DEFAULT_WIDTH = 220;
const MIN_COL_WIDTH = 10;

// 컬럼별 정렬 함수 정의입니다.
// 상태 정렬 우선순위입니다. 숫자가 낮을수록 먼저 표시됩니다.
const STATUS_ORDER = (s) => {
    switch ((s ?? '').toLowerCase()) {
        case 'zombie':     case 'z': return 0;
        case 'stopped':    case 't':
        case 'disk-sleep': case 'd': return 1;
        case 'sleeping':   case 's': return 2;
        case 'idle':       case 'i': return 3;
        case 'running':    case 'r': return 4;
        default:                     return 5;
    }
};

const SORTERS = {
    name:           (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko-KR'),
    pid:            (a, b) => toSafeNumber(a.pid)            - toSafeNumber(b.pid),
    username:       (a, b) => String(a.username ?? '').localeCompare(String(b.username ?? '')),
    // 실행 중 → 대기 중 → 비활성 → 중지 → 좀비 순으로 정렬합니다.
    status:         (a, b) => STATUS_ORDER(a.status) - STATUS_ORDER(b.status),
    cpu_percent:    (a, b) => toSafeNumber(b.cpu_percent)    - toSafeNumber(a.cpu_percent),
    memory_mb:      (a, b) => toSafeNumber(b.memory_mb)      - toSafeNumber(a.memory_mb),
    memory_percent: (a, b) => toSafeNumber(b.memory_percent) - toSafeNumber(a.memory_percent),
    disk_read_mb:   (a, b) => toSafeNumber(b.disk_read_mb)   - toSafeNumber(a.disk_read_mb),
    disk_write_mb:  (a, b) => toSafeNumber(b.disk_write_mb)  - toSafeNumber(a.disk_write_mb),
    thread_count:   (a, b) => toSafeNumber(b.thread_count)   - toSafeNumber(a.thread_count),
};

// 프로세스 상태에 따른 한글 레이블과 배지 색상을 반환합니다.
// Linux 상태: R(running), S(sleeping), D(disk sleep), Z(zombie), T(stopped), I(idle)
// 프로세스 상태에 따른 한글 레이블과 배지 배경색을 반환합니다. 글씨는 모두 흰색입니다.
// Linux 상태: R(running), S(sleeping), D(disk sleep), Z(zombie), T(stopped), I(idle)
const STATUS_MAP = (s) => {
    switch ((s ?? '').toLowerCase()) {
        case 'running':    case 'r': return { label: '실행', bg: 'var(--bs-success)' };
        case 'sleeping':   case 's': return { label: '대기', bg: 'var(--bs-primary)' };
        case 'idle':       case 'i': return { label: '비활', bg: 'var(--bs-gray)' };
        case 'stopped':    case 't':
        case 'disk-sleep': case 'd': return { label: '중지', bg: 'var(--bs-orange)' };
        case 'zombie':     case 'z': return { label: '좀비', bg: 'var(--bs-danger)' };
        default:                     return { label: s ?? '-', bg: 'var(--bs-secondary)' };
    }
};

// 컬럼 키에 따라 셀 값을 렌더링합니다. overflow:hidden으로 다른 영역을 침범하지 않습니다.
const CELL_STYLE = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
const renderCell = (key, p) => {
    switch (key) {
        case 'pid':            return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.pid}</td>;
        case 'username':       return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.username}</td>;
        case 'status':         return (
            <td key={key} style={CELL_STYLE}>
                {(() => { const { label, bg } = STATUS_MAP(p.status); return <span className="badge" style={{ backgroundColor: bg, color: 'var(--bs-white)' }}>{label}</span>; })()}
            </td>
        );
        case 'cpu_percent':    return <td key={key} className="text-white"    style={CELL_STYLE}>{p.cpu_percent.toFixed(1)}%</td>;
        case 'memory_mb':      return <td key={key} className="text-white"    style={CELL_STYLE}>{p.memory_mb.toFixed(1)} MB</td>;
        case 'memory_percent': return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.memory_percent.toFixed(1)}%</td>;
        case 'disk_read_mb':   return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.disk_read_mb.toFixed(2)} MB</td>;
        case 'disk_write_mb':  return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.disk_write_mb.toFixed(2)} MB</td>;
        case 'thread_count':   return <td key={key} className="text-white-50" style={CELL_STYLE}>{p.thread_count}</td>;
        default:               return null;
    }
};

// 정렬 방향 아이콘을 반환합니다.
const SortIcon = ({ col, sortBy, sortAsc }) => {
    if (sortBy !== col) return <span className="ms-1 opacity-25">⇅</span>;
    return <span className="ms-1">{sortAsc ? '↑' : '↓'}</span>;
};

/**
 * 드래그 리사이즈 핸들이 포함된 정렬 가능한 헤더 셀입니다.
 * forwardRef로 외부에서 th DOM 엘리먼트를 참조할 수 있게 합니다.
 * 모듈 스코프에 정의하여 부모 렌더링 시 unmount/remount가 발생하지 않도록 합니다.
 */
const Th = forwardRef(({ col, sortBy, sortAsc, onSort, onResizeStart, children }, ref) => (
    <th
        ref={ref}
        onClick={() => onSort(col)}
        className="fw-semibold small process-th"
    >
        {children}
        <SortIcon col={col} sortBy={sortBy} sortAsc={sortAsc} />
        {/* 컬럼 크기 조절 핸들입니다. overflow:hidden 영향을 받지 않도록 position:absolute로 배치합니다. */}
        <span
            className="process-resize-handle"
            onMouseDown={(e) => onResizeStart(e, col)}
            onClick={(e) => e.stopPropagation()}
        />
    </th>
));

function ProcessTable({ processes, isConnected, lastUpdated, onKill, killResult }) {
    const [search, setSearch]   = useState('');
    const [sortBy, setSortBy]   = useState('cpu_percent');
    const [sortAsc, setSortAsc] = useState(false);


    // 종료 확인 중인 PID, 요청 진행 중인 PID 집합, 토스트 메시지를 관리합니다.
    const [confirmPid, setConfirmPid]   = useState(null);
    const [killingPids, setKillingPids] = useState(new Set());
    const [toast, setToast]             = useState(null); // { message, type }
    const deferredSearch        = useDeferredValue(search);

    // 표시할 컬럼을 관리합니다.
    const [visible, setVisible] = useState(
        Object.fromEntries(COLUMNS.map(c => [c.key, true]))
    );
    const toggleCol = (key) => setVisible(prev => ({ ...prev, [key]: !prev[key] }));
    const visibleCols = COLUMNS.filter(c => visible[c.key]);

    // 각 컬럼의 px 너비를 state로 관리합니다.
    const [colWidths, setColWidths] = useState(() => {
        const map = { name: NAME_DEFAULT_WIDTH };
        COLUMNS.forEach(c => { map[c.key] = c.width; });
        return map;
    });

    // colWidths의 최신 값을 동기적으로 읽기 위한 ref입니다.
    const colWidthsRef = useRef(colWidths);
    colWidthsRef.current = colWidths;

    // visible의 최신 값을 동기적으로 읽기 위한 ref입니다.
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    // 컬럼 드롭다운 열림 여부 (Bootstrap JS 대신 React state로 관리 — 리렌더링 시 닫힘 방지)
    const [colDropOpen, setColDropOpen] = useState(false);
    const colDropRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (colDropRef.current && !colDropRef.current.contains(e.target)) {
                setColDropOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 드래그 중 여부를 추적합니다. mouseup 후 click 이벤트에서 sort가 발동하는 버그를 방지합니다.
    const isDragging = useRef(false);

    // 각 th DOM 엘리먼트를 직접 참조하기 위한 map입니다. (드래그 중 DOM 직접 조작용)
    const colEls = useRef({});

    // 각 <col> DOM 엘리먼트를 직접 참조합니다. colgroup을 통해 컬럼 너비를 제어합니다.
    // th 대신 col을 조작하면 table-layout:fixed 하에서 다른 컬럼이 재분배되지 않습니다.
    const colGroupRefs = useRef({});

    // table DOM 엘리먼트 참조입니다. (드래그 중 table 전체 너비 직접 조작용)
    const tableRef = useRef(null);

    // 헤더 경계선 mousedown 시 드래그를 시작합니다.
    // 드래그 중에는 React state 대신 DOM을 직접 조작해 리렌더링을 0으로 줄입니다.
    // mouseup 시에만 state를 1회 업데이트합니다.
    const onResizeStart = useCallback((e, colKey) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging.current = true;
        const startX = e.clientX;
        const startW = colWidthsRef.current[colKey];
        let finalWidth = startW;

        const onMove = (ev) => {
            finalWidth = Math.max(MIN_COL_WIDTH, startW + (ev.clientX - startX));

            // <col> 요소의 너비만 변경합니다. 다른 컬럼 <col>은 건드리지 않으므로 재분배가 발생하지 않습니다.
            const col = colGroupRefs.current[colKey];
            if (col) col.style.width = finalWidth + 'px';

            // table 전체 너비를 늘려 다른 컬럼이 밀리지 않도록 합니다.
            if (tableRef.current) {
                const widths  = colWidthsRef.current;
                const vis     = visibleRef.current;
                const newTotal = COLUMNS.reduce((sum, c) => {
                    if (!vis[c.key]) return sum;
                    return sum + (c.key === colKey ? finalWidth : widths[c.key]);
                }, (colKey === 'name' ? finalWidth : widths['name'])) + 90; // 90 = KILL_COL_WIDTH
                tableRef.current.style.width = newTotal + 'px';
            }
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // 드래그 종료 시 React state를 1회만 업데이트합니다.
            setColWidths(prev => ({ ...prev, [colKey]: finalWidth }));
            // click 이벤트가 처리된 다음 프레임에 isDragging을 해제합니다.
            requestAnimationFrame(() => { isDragging.current = false; });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor    = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    // 컬럼 헤더 클릭 시 정렬 기준을 변경하거나 방향을 반전합니다.
    // 드래그 직후 click 이벤트가 발생해도 sort가 발동하지 않도록 isDragging을 확인합니다.
    // setSortBy updater 내부에서 setSortAsc를 호출하면 React 배치 처리 시 순서가 꼬이므로 분리합니다.
    const handleSort = useCallback((col) => {
        if (isDragging.current) return;
        if (sortBy === col) {
            setSortAsc(prev => !prev);
        } else {
            setSortBy(col);
            setSortAsc(false);
        }
    }, [sortBy]);

    // kill 결과가 WebSocket으로 도착하면 스피너를 제거하고 토스트를 표시합니다.
    useEffect(() => {
        if (!killResult) return;
        setKillingPids(prev => { const s = new Set(prev); s.delete(killResult.pid); return s; });
        setToast({ message: killResult.message, type: killResult.success ? 'success' : 'danger' });
    }, [killResult]);

    // 종료 버튼 클릭 시 스피너를 표시하고 STOMP로 kill 명령을 전송합니다.
    const handleKill = useCallback((pid, name) => {
        setKillingPids(prev => new Set(prev).add(pid));
        setConfirmPid(null);
        onKill(pid, name);
    }, [onKill]);

    // 현재 보이는 컬럼의 너비 합산 + 종료 버튼 컬럼(90px) (테이블 width로 사용합니다).
    const KILL_COL_WIDTH = 90;
    const totalTableWidth = useMemo(
        () => colWidths['name'] + visibleCols.reduce((sum, c) => sum + colWidths[c.key], 0) + KILL_COL_WIDTH,
        [colWidths, visibleCols]
    );

    const rows = processes
        .filter((p) => {
            const kw = deferredSearch.trim().toLowerCase();
            if (!kw) return true;
            return [p.name, p.username, p.status, String(p.pid), p.cmdline]
                .some((v) => String(v ?? '').toLowerCase().includes(kw));
        })
        .sort((a, b) => {
            const result = (SORTERS[sortBy] ?? SORTERS.cpu_percent)(a, b);
            return sortAsc ? -result : result;
        })
        .map((p) => ({
            ...p,
            pid:            toSafeNumber(p.pid),
            name:           p.name           ?? 'Unknown',
            username:       p.username        ?? '-',
            status:         p.status          ?? 'unknown',
            cpu_percent:    toSafeNumber(p.cpu_percent),
            memory_mb:      toSafeNumber(p.memory_mb),
            memory_percent: toSafeNumber(p.memory_percent),
            disk_read_mb:   toSafeNumber(p.disk_read_mb),
            disk_write_mb:  toSafeNumber(p.disk_write_mb),
            thread_count:   toSafeNumber(p.thread_count),
            cmdline:        p.cmdline ?? '',
            exe:            p.exe     ?? '',
            started_at:     p.started_at ?? null,
        }));

    const renderUpdatedAt = () => {
        if (!lastUpdated) return '수신 대기 중';
        const d = new Date(lastUpdated);
        return Number.isNaN(d.getTime()) ? lastUpdated : d.toLocaleString('ko-KR');
    };

    return (
        <section className="d-flex flex-column gap-3 overflow-hidden" style={{ height: 'calc(100vh - 160px)' }}>
            {/* 프로세스 종료 결과 Toast */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* ── 툴바 (고정) ── */}
            <div className="d-flex flex-column gap-2 flex-shrink-0">
                <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
                    <div>
                        <h5 className="mb-0 text-info">프로세스 관리자</h5>
                        <small className="text-white-50">
                            {isConnected ? '실시간 연결 중' : '연결 대기 중'} &nbsp;·&nbsp; {renderUpdatedAt()}
                        </small>
                    </div>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="form-control form-control-sm"
                        placeholder="프로세스명 · PID · 사용자"
                        style={{ maxWidth: '240px' }}
                    />
                </div>

                {/* 컬럼 표시 토글 및 프로세스 수 */}
                <div className="d-flex align-items-center justify-content-between gap-3">
                    {/* 컬럼 표시/숨기기 드롭다운 (React state로 열림 관리 — 리렌더링 시 닫힘 방지) */}
                    <div className="dropdown" ref={colDropRef}>
                        <button
                            className="btn btn-sm process-col-toggle-btn"
                            onClick={() => setColDropOpen(prev => !prev)}
                        >
                            표시할 항목 ▾
                        </button>
                        {colDropOpen && (
                            <ul className="dropdown-menu dropdown-menu-dark show process-col-dropdown">
                                {COLUMNS.map(c => (
                                    <li key={c.key}>
                                        <label className="process-col-dropdown-item">
                                            <input
                                                type="checkbox"
                                                checked={visible[c.key]}
                                                onChange={() => toggleCol(c.key)}
                                                style={{ accentColor: 'var(--bs-info)', width: '13px', height: '13px' }}
                                            />
                                            <span className={visible[c.key] ? 'text-white' : 'text-white-50'}>
                                                {c.label}
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <small className="text-white-50">실행중인 프로세스 수 <span className="text-info fw-semibold">{rows.length}개</span></small>
                </div>
            </div>

            {/* ── 빈 상태 ── */}
            {rows.length === 0 && (
                <div className="text-center py-5 text-white-50 border border-secondary border-opacity-25 rounded-3">
                    {processes.length === 0
                        ? '프로세스 데이터 수신 대기 중입니다.'
                        : '검색 조건에 맞는 프로세스가 없습니다.'}
                </div>
            )}

            {/* ── 데스크톱 테이블 ── */}
            {rows.length > 0 && (
                <div className="d-none d-lg-flex flex-column flex-grow-1 rounded-3 overflow-hidden" style={{ border: '1px solid var(--bs-primary)' }}>
                    <div className="overflow-y-auto flex-grow-1" style={{ overflowX: 'auto' }}>
                        <table
                            ref={tableRef}
                            className="table table-hover align-middle mb-0"
                            style={{
                                fontSize: '0.84rem',
                                tableLayout: 'fixed',
                                backgroundColor: 'var(--bs-dark)',
                                /* minWidth:'100%' 제거 — 컨테이너보다 넓을 때 브라우저가 남은 공간을 다른 컬럼에 재분배하는 현상 방지 */
                                width: totalTableWidth,
                            }}
                        >
                            {/* colgroup으로 컬럼 너비를 선언합니다. table-layout:fixed 하에서 col 요소만 조작하면 다른 컬럼에 영향을 주지 않습니다. */}
                            <colgroup>
                                <col ref={el => { colGroupRefs.current['name'] = el; }} style={{ width: colWidths['name'] }} />
                                {visibleCols.map(c => (
                                    <col key={c.key} ref={el => { colGroupRefs.current[c.key] = el; }} style={{ width: colWidths[c.key] }} />
                                ))}
                                <col style={{ width: KILL_COL_WIDTH }} />
                            </colgroup>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr className="border-bottom border-secondary">
                                    <Th ref={el => { colEls.current['name'] = el; }} col="name" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort} onResizeStart={onResizeStart}>프로세스</Th>
                                    {visibleCols.map(c => (
                                        <Th key={c.key} ref={el => { colEls.current[c.key] = el; }} col={c.key} sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort} onResizeStart={onResizeStart}>
                                            {c.label}
                                        </Th>
                                    ))}
                                    {/* 종료 버튼 고정 컬럼 헤더 */}
                                    <th className="fw-semibold small text-center"
                                        style={{ backgroundColor: 'var(--bs-dark)', color: 'var(--bs-body-color)', borderRight: '2px solid rgba(255,255,255,0.15)' }}>
                                        종료
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((p) => (
                                    <tr key={`${p.pid}-${p.started_at ?? 'x'}`}>
                                        <td style={{ overflow: 'hidden' }}>
                                            <div className="text-white fw-semibold text-truncate">{p.name}</div>
                                        </td>
                                        {visibleCols.map(c => renderCell(c.key, p))}
                                        {/* 종료 버튼: 클릭 시 인라인 확인/취소로 전환됩니다. */}
                                        <td className="text-center">
                                            {killingPids.has(p.pid) ? (
                                                <span className="spinner-border spinner-border-sm text-danger" />
                                            ) : confirmPid === p.pid ? (
                                                <div className="d-flex gap-1 justify-content-center">
                                                    <button className="btn btn-danger btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                                        onClick={() => handleKill(p.pid, p.name)}>확인</button>
                                                    <button className="btn btn-secondary btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                                        onClick={() => setConfirmPid(null)}>취소</button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-outline-danger btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                                    onClick={() => setConfirmPid(p.pid)}>종료</button>
                                            )}
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
                    {rows.map((p) => (
                        <div
                            key={`${p.pid}-${p.started_at ?? 'x'}-m`}
                            className="card bg-dark border-secondary border-opacity-25"
                        >
                            <div className="card-body py-2 px-3">
                                <div className="text-white fw-semibold">{p.name}</div>
                                <small className="text-white-50">PID {p.pid} · {p.username} · {(() => { const { label, bg } = STATUS_MAP(p.status); return <span className="badge" style={{ backgroundColor: bg, color: 'var(--bs-white)' }}>{label}</span>; })()}</small>
                                <div className="row row-cols-2 g-1 mt-1" style={{ fontSize: '0.82rem' }}>
                                    {visibleCols.map(c => (
                                        <div key={c.key} className="col">
                                            <span className="text-white-50">{c.label} </span>
                                            <span className="text-white">{
                                                c.key === 'cpu_percent'    ? `${p.cpu_percent.toFixed(1)}%` :
                                                c.key === 'memory_mb'      ? `${p.memory_mb.toFixed(1)} MB` :
                                                c.key === 'memory_percent' ? `${p.memory_percent.toFixed(1)}%` :
                                                c.key === 'disk_read_mb'   ? `${p.disk_read_mb.toFixed(2)} MB` :
                                                c.key === 'disk_write_mb'  ? `${p.disk_write_mb.toFixed(2)} MB` :
                                                p[c.key]
                                            }</span>
                                        </div>
                                    ))}
                                </div>
                                {/* 모바일 종료 버튼 */}
                                <div className="mt-2 d-flex justify-content-end">
                                    {killingPids.has(p.pid) ? (
                                        <span className="spinner-border spinner-border-sm text-danger" />
                                    ) : confirmPid === p.pid ? (
                                        <div className="d-flex gap-1">
                                            <button className="btn btn-danger btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                                onClick={() => handleKill(p.pid, p.name)}>확인</button>
                                            <button className="btn btn-secondary btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                                onClick={() => setConfirmPid(null)}>취소</button>
                                        </div>
                                    ) : (
                                        <button className="btn btn-outline-danger btn-sm py-0 px-2" style={{ fontSize: '0.75rem' }}
                                            onClick={() => setConfirmPid(p.pid)}>종료</button>
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

export default ProcessTable;
