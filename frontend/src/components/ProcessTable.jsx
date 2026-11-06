import React, { useDeferredValue, useState, useRef, useCallback, useMemo, useEffect, forwardRef } from 'react';
import { useToast } from '../context/ToastContext';
import { useContextMenuDismiss } from '../hooks/useContextMenuDismiss';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatBytes } from '../utils/format';
import './ProcessTable.css';

// 숫자 필드가 비어 있거나 문자열이어도 안전하게 숫자로 변환합니다.
const toSafeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatProcessBytes = (value) => formatBytes(value) ?? '0 B';

const formatBytesPerSecond = (value) => `${formatProcessBytes(value)}/s`;

// 컬럼 정의입니다. width는 초기 px 값이며 드래그로 변경됩니다.
const COLUMNS = [
    { key: 'pid',            label: 'PID',      width: 70  },
    { key: 'username',       label: '사용자',    width: 90  },
    { key: 'status',         label: '상태',      width: 90  },
    { key: 'cpu_percent',    label: 'CPU',       width: 80  },
    { key: 'memory_bytes',   label: '메모리',    width: 110 },
    { key: 'memory_percent', label: '메모리 %',  width: 90  },
    { key: 'disk_read_bytes_per_second',   label: '읽기 속도',  width: 110 },
    { key: 'disk_write_bytes_per_second',  label: '쓰기 속도',  width: 110 },
    { key: 'thread_count',   label: '스레드',    width: 75  },
];
const NAME_DEFAULT_WIDTH = 220;
const MIN_COL_WIDTH = 10;
const CONTEXT_MENU_WIDTH = 180;
const CONTEXT_MENU_HEIGHT = 128;
// kill 결과가 이 시간 안에 오지 않으면 스피너를 풀고 사용자에게 알립니다.
const KILL_RESULT_TIMEOUT_MS = 15_000;
// 우클릭 직전 pointerdown부터 메뉴가 뜰 때까지 1초 주기 재정렬로 다른 행이 선택되지 않도록 순서를 고정합니다.
const ORDER_FREEZE_MS = 1000;

const rowKeyOf = (p) => `${p.pid}-${p.started_at ?? 'x'}`;

const isContextMenuKey = (event) => event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');

const clampMenuPosition = (x, y) => {
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    return {
        x: Math.max(8, viewportWidth ? Math.min(x, viewportWidth - CONTEXT_MENU_WIDTH - 8) : x),
        y: Math.max(8, viewportHeight ? Math.min(y, viewportHeight - CONTEXT_MENU_HEIGHT - 8) : y),
    };
};

const normalizeProcess = (p) => ({
    ...p,
    pid:            toSafeNumber(p.pid),
    name:           p.name           ?? 'Unknown',
    username:       p.username        ?? '-',
    status:         p.status          ?? 'unknown',
    cpu_percent:    toSafeNumber(p.cpu_percent),
    memory_bytes:   toSafeNumber(p.memory_bytes ?? toSafeNumber(p.memory_mb) * 1024 * 1024),
    memory_percent: toSafeNumber(p.memory_percent),
    disk_read_bytes_per_second:  toSafeNumber(p.disk_read_bytes_per_second ?? toSafeNumber(p.disk_read_mb) * 1024 * 1024),
    disk_write_bytes_per_second: toSafeNumber(p.disk_write_bytes_per_second ?? toSafeNumber(p.disk_write_mb) * 1024 * 1024),
    thread_count:   toSafeNumber(p.thread_count),
    cmdline:        p.cmdline ?? '',
    exe:            p.exe     ?? '',
    started_at:     p.started_at ?? null,
});

// 컬럼별 정렬 함수 정의입니다.
// 상태 정렬 우선순위입니다. 숫자가 낮을수록 먼저 표시됩니다.
const STATUS_ORDER = (s) => {
    switch ((s ?? '').toLowerCase()) {
        case 'running':    case 'r':
        case 'sleeping':   case 's':
        case 'idle':       case 'i': return 0;
        case 'stopped':    case 't': return 1;
        case 'disk-sleep': case 'd': return 2;
        case 'zombie':     case 'z': return 3;
        default:                     return 5;
    }
};

const SORTERS = {
    name:           (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko-KR'),
    pid:            (a, b) => toSafeNumber(a.pid)            - toSafeNumber(b.pid),
    username:       (a, b) => String(a.username ?? '').localeCompare(String(b.username ?? '')),
    // 사용자에게 보이는 작업관리자식 상태 우선순위입니다.
    status:         (a, b) => STATUS_ORDER(a.status) - STATUS_ORDER(b.status),
    cpu_percent:    (a, b) => toSafeNumber(b.cpu_percent)    - toSafeNumber(a.cpu_percent),
    memory_bytes:   (a, b) => toSafeNumber(b.memory_bytes)   - toSafeNumber(a.memory_bytes),
    memory_percent: (a, b) => toSafeNumber(b.memory_percent) - toSafeNumber(a.memory_percent),
    disk_read_bytes_per_second:  (a, b) => toSafeNumber(b.disk_read_bytes_per_second)  - toSafeNumber(a.disk_read_bytes_per_second),
    disk_write_bytes_per_second: (a, b) => toSafeNumber(b.disk_write_bytes_per_second) - toSafeNumber(a.disk_write_bytes_per_second),
    thread_count:   (a, b) => toSafeNumber(b.thread_count)   - toSafeNumber(a.thread_count),
};

// 내부 프로세스 상태를 Windows 작업관리자에 가까운 사용자 표시로 변환합니다.
// Linux 상태: R(running), S(sleeping), D(disk sleep), Z(zombie), T(stopped), I(idle)
const STATUS_MAP = (s) => {
    switch ((s ?? '').toLowerCase()) {
        case 'running':    case 'r':
        case 'sleeping':   case 's':
        case 'idle':       case 'i': return { label: '실행 중', bg: 'var(--pm-success)' };
        case 'stopped':    case 't': return { label: '일시 중단됨', bg: 'var(--pm-warning)' };
        case 'disk-sleep': case 'd': return { label: '응답 없음', bg: 'var(--pm-warning)' };
        case 'zombie':     case 'z': return { label: '종료됨', bg: 'var(--pm-danger)' };
        default:                     return { label: s ?? '-', bg: 'var(--pm-neutral)' };
    }
};

// 컬럼 키에 따라 셀 값을 렌더링합니다. overflow:hidden으로 다른 영역을 침범하지 않습니다.
const CELL_STYLE = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
const HEATMAP_COLUMNS = new Set([
    'cpu_percent',
    'memory_bytes',
    'memory_percent',
    'disk_read_bytes_per_second',
    'disk_write_bytes_per_second',
]);

const clampHeat = (value) => Math.min(Math.max(value, 0), 1);

const getResourceHeat = (key, p, scales) => {
    if (!HEATMAP_COLUMNS.has(key)) return null;

    const value = toSafeNumber(p[key]);
    let ratio = 0;
    if (key === 'cpu_percent' || key === 'memory_percent') {
        ratio = value / 100;
    } else {
        ratio = value / Math.max(toSafeNumber(scales[key]), 1);
    }

    const heat = clampHeat(ratio);
    if (heat <= 0) return null;

    const alpha = 0.06 + (heat * 0.26);
    return {
        backgroundColor: `rgba(247, 201, 72, ${alpha.toFixed(3)})`,
        boxShadow: heat > 0.68 ? `inset 0 0 0 1px rgba(247, 201, 72, ${(alpha + 0.08).toFixed(3)})` : undefined,
    };
};

const renderHeatValue = (key, p) => {
    switch (key) {
        case 'cpu_percent':    return `${p.cpu_percent.toFixed(1)}%`;
        case 'memory_bytes':   return formatProcessBytes(p.memory_bytes);
        case 'memory_percent': return `${p.memory_percent.toFixed(1)}%`;
        case 'disk_read_bytes_per_second':  return formatBytesPerSecond(p.disk_read_bytes_per_second);
        case 'disk_write_bytes_per_second': return formatBytesPerSecond(p.disk_write_bytes_per_second);
        default:               return p[key];
    }
};

const renderResourceCell = (key, p, heatScales) => (
    <td
        key={key}
        className="pm-manager-value pm-manager-heat-cell"
        style={{ ...CELL_STYLE, ...getResourceHeat(key, p, heatScales) }}
    >
        {renderHeatValue(key, p)}
    </td>
);

const renderCell = (key, p, heatScales) => {
    switch (key) {
        case 'pid':            return <td key={key} className="pm-manager-muted" style={CELL_STYLE}>{p.pid}</td>;
        case 'username':       return <td key={key} className="pm-manager-muted" style={CELL_STYLE}>{p.username}</td>;
        case 'status':         return (
            <td key={key} style={CELL_STYLE}>
                {(() => { const { label, bg } = STATUS_MAP(p.status); return <span className="pm-status-badge" style={{ backgroundColor: bg }}>{label}</span>; })()}
            </td>
        );
        case 'cpu_percent':
        case 'memory_bytes':
        case 'memory_percent':
        case 'disk_read_bytes_per_second':
        case 'disk_write_bytes_per_second':
            return renderResourceCell(key, p, heatScales);
        case 'thread_count':   return <td key={key} className="pm-manager-muted" style={CELL_STYLE}>{p.thread_count}</td>;
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

function ProcessTable({ processes, isConnected, lastUpdated, onKill, killResult, canControlProcesses = true }) {
    const [search, setSearch]   = useState('');
    const [sortBy, setSortBy]   = useState('cpu_percent');
    const [sortAsc, setSortAsc] = useState(false);


    // 요청 진행 중인 PID 집합, 우클릭 메뉴, 전역 토스트 알림을 관리합니다.
    const [contextMenu, setContextMenu] = useState(null);
    const [killingProcesses, setKillingProcesses] = useState({});
    const processesVersionRef = useRef(0);
    const { showToast }                 = useToast();
    const deferredSearch        = useDeferredValue(search);
    // 테이블과 카드를 둘 다 렌더링하고 CSS로 숨기면 1초마다 두 배로 그리므로, 화면 폭에 맞는 쪽만 렌더링합니다.
    const isDesktop             = useMediaQuery('(min-width: 992px)');
    // 메뉴가 열려 있거나 pointerdown 직후에는 행 순서(키 목록)를 고정합니다. 값은 계속 갱신됩니다.
    const [frozenOrder, setFrozenOrder] = useState(null);
    const freezeTimerRef = useRef(null);
    const menuOpenRef    = useRef(false);
    const menuRef        = useRef(null);
    const killTimersRef  = useRef({});
    const killingRef     = useRef(killingProcesses);
    useEffect(() => {
        killingRef.current = killingProcesses;
    }, [killingProcesses]);

    useEffect(() => () => {
        clearTimeout(freezeTimerRef.current);
        Object.values(killTimersRef.current).forEach(clearTimeout);
    }, []);

    // 표시할 컬럼을 관리합니다.
    // pid·username·thread_count는 기본적으로 숨겨 두고 필요 시 토글합니다.
    const HIDDEN_BY_DEFAULT = new Set(['pid', 'username', 'thread_count']);
    const [visible, setVisible] = useState(
        Object.fromEntries(COLUMNS.map(c => [c.key, !HIDDEN_BY_DEFAULT.has(c.key)]))
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
    useEffect(() => {
        colWidthsRef.current = colWidths;
    }, [colWidths]);

    useEffect(() => {
        processesVersionRef.current += 1;
    }, [processes]);

    // visible의 최신 값을 동기적으로 읽기 위한 ref입니다.
    const visibleRef = useRef(visible);
    useEffect(() => {
        visibleRef.current = visible;
    }, [visible]);

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

    const closeContextMenu = useCallback(() => {
        menuOpenRef.current = false;
        setContextMenu(null);
        // pointerdown 직후 고정 시간이 남아 있으면 타이머가 끝날 때 해제합니다.
        if (!freezeTimerRef.current) setFrozenOrder(null);
    }, []);

    const freezeRowOrder = useCallback((currentRows) => {
        setFrozenOrder(prev => prev ?? currentRows.map(rowKeyOf));
        clearTimeout(freezeTimerRef.current);
        freezeTimerRef.current = setTimeout(() => {
            freezeTimerRef.current = null;
            if (!menuOpenRef.current) setFrozenOrder(null);
        }, ORDER_FREEZE_MS);
    }, []);

    useContextMenuDismiss(Boolean(contextMenu), closeContextMenu, {
        menuRef,
        focusKey: contextMenu?.confirming,
    });

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
                }, (colKey === 'name' ? finalWidth : widths['name']));
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

    // 대기 중인 kill 요청을 정리하고 결과 대기 타이머도 함께 해제합니다.
    const settleKills = useCallback((pids) => {
        pids.forEach(pid => {
            clearTimeout(killTimersRef.current[pid]);
            delete killTimersRef.current[pid];
        });
        setKillingProcesses(prev => {
            const next = { ...prev };
            pids.forEach(pid => {
                delete next[pid];
            });
            return next;
        });
    }, []);

    useEffect(() => {
        const completed = Object.entries(killingProcesses).filter(([pid, pending]) => {
            if (!pending?.commandDone) return false;
            if (processesVersionRef.current <= pending.startedAtVersion) return false;
            return !processes.some(process => toSafeNumber(process.pid) === toSafeNumber(pid));
        });
        if (completed.length === 0) return undefined;

        const timer = setTimeout(() => {
            settleKills(completed.map(([pid]) => pid));
            completed.forEach(([, pending]) => {
                showToast('success', pending.message || '프로세스가 종료됐습니다.');
            });
        }, 0);
        return () => clearTimeout(timer);
    }, [killingProcesses, processes, settleKills, showToast]);

    // kill 결과는 명령 실행 결과입니다. 실제 UI 완료는 다음 프로세스 목록에서 PID가 사라질 때 처리합니다.
    useEffect(() => {
        if (!killResult) return;
        const timer = setTimeout(() => {
            const pendingMap = killingRef.current;
            // requestId가 있으면 같은 요청만 매칭하고, 없으면(구버전 에이전트/백엔드) PID로 매칭합니다.
            const pendingKey = killResult.requestId
                ? Object.keys(pendingMap).find(key => pendingMap[key]?.requestId === killResult.requestId)
                : (pendingMap[killResult.pid] ? String(killResult.pid) : undefined);

            if (!killResult.success) {
                // 다른 탭/사용자가 보낸 요청의 실패 결과는 이 화면에 표시하지 않습니다.
                if (killResult.requestId && !pendingKey) return;
                if (pendingKey) settleKills([pendingKey]);
                showToast('danger', killResult.message);
                return;
            }

            if (!pendingKey) return;
            setKillingProcesses(prev => {
                const pending = prev[pendingKey];
                if (!pending) return prev;
                return {
                    ...prev,
                    [pendingKey]: {
                        ...pending,
                        commandDone: true,
                        message: killResult.message,
                    },
                };
            });
        }, 0);
        return () => clearTimeout(timer);
    }, [killResult, settleKills, showToast]);

    // 종료 확인 시 STOMP로 kill 명령을 전송하고, 전송된 경우에만 진행 중 상태로 표시합니다.
    const handleKill = useCallback((process) => {
        if (!canControlProcesses) return;
        closeContextMenu();
        const requestId = onKill({ pid: process.pid, startedAt: process.started_at ?? null, name: process.name });
        if (!requestId) {
            showToast('danger', '서버와 연결되어 있지 않아 종료 요청을 보내지 못했습니다.');
            return;
        }

        const { pid } = process;
        clearTimeout(killTimersRef.current[pid]);
        killTimersRef.current[pid] = setTimeout(() => {
            delete killTimersRef.current[pid];
            setKillingProcesses(prev => {
                if (!prev[pid]) return prev;
                const next = { ...prev };
                delete next[pid];
                return next;
            });
            showToast('warning', '결과를 확인하지 못했습니다');
        }, KILL_RESULT_TIMEOUT_MS);

        setKillingProcesses(prev => ({
            ...prev,
            [pid]: {
                pid,
                requestId,
                commandDone: false,
                startedAtVersion: processesVersionRef.current,
                message: '',
            },
        }));
    }, [canControlProcesses, closeContextMenu, onKill, showToast]);

    const sortedRows = useMemo(() => {
        const kw = deferredSearch.trim().toLowerCase();
        return processes
            .filter((p) => {
                if (!kw) return true;
                return [p.name, p.username, p.status, String(p.pid), p.cmdline]
                    .some((v) => String(v ?? '').toLowerCase().includes(kw));
            })
            .sort((a, b) => {
                const result = (SORTERS[sortBy] ?? SORTERS.cpu_percent)(a, b);
                return sortAsc ? -result : result;
            })
            .map(normalizeProcess);
    }, [processes, deferredSearch, sortBy, sortAsc]);

    const rows = useMemo(() => {
        if (!frozenOrder) return sortedRows;
        const byKey = new Map(sortedRows.map(p => [rowKeyOf(p), p]));
        const frozenKeys = new Set(frozenOrder);
        // 고정된 순서대로 최신 값을 채우고, 새로 생긴 프로세스는 기존 행이 밀리지 않도록 맨 뒤에 붙입니다.
        return [
            ...frozenOrder.map(key => byKey.get(key)).filter(Boolean),
            ...sortedRows.filter(p => !frozenKeys.has(rowKeyOf(p))),
        ];
    }, [sortedRows, frozenOrder]);

    const heatScales = useMemo(() => rows.reduce((scales, p) => ({
        memory_bytes: Math.max(scales.memory_bytes, p.memory_bytes),
        disk_read_bytes_per_second: Math.max(scales.disk_read_bytes_per_second, p.disk_read_bytes_per_second),
        disk_write_bytes_per_second: Math.max(scales.disk_write_bytes_per_second, p.disk_write_bytes_per_second),
    }), {
        memory_bytes: 1,
        disk_read_bytes_per_second: 1,
        disk_write_bytes_per_second: 1,
    }), [rows]);

    const openContextMenuAt = useCallback((position, process) => {
        freezeRowOrder(rows);
        menuOpenRef.current = true;
        setContextMenu({
            ...clampMenuPosition(position.x, position.y),
            process,
            confirming: false,
        });
    }, [freezeRowOrder, rows]);

    const canOpenMenuFor = (process) => canControlProcesses && !killingProcesses[process.pid];

    const openContextMenu = (event, process) => {
        if (!canOpenMenuFor(process)) return;
        event.preventDefault();
        // 키보드로 발생한 contextmenu 이벤트는 좌표가 0이므로 행 위치를 기준으로 엽니다.
        if (event.clientX === 0 && event.clientY === 0) {
            const rect = event.currentTarget.getBoundingClientRect();
            openContextMenuAt({ x: rect.left + 16, y: rect.bottom }, process);
            return;
        }
        openContextMenuAt({ x: event.clientX, y: event.clientY }, process);
    };

    // ContextMenu 키 / Shift+F10으로 행(또는 행 안의 ⋯ 버튼)에서 메뉴를 엽니다.
    const handleRowKeyDown = (event, process) => {
        if (!isContextMenuKey(event) || !canOpenMenuFor(process)) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        openContextMenuAt({ x: rect.left + 16, y: rect.bottom }, process);
    };

    const openActionMenu = (event, process) => {
        // 버튼 click이 window까지 전파되면 방금 연 메뉴가 바로 닫히므로 막습니다.
        event.stopPropagation();
        if (!canOpenMenuFor(process)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        openContextMenuAt({ x: rect.right - CONTEXT_MENU_WIDTH, y: rect.bottom + 4 }, process);
    };

    const requestContextKill = () => {
        setContextMenu(prev => prev ? { ...prev, confirming: true } : prev);
    };

    const confirmContextKill = () => {
        const target = contextMenu?.process;
        if (!target) return;
        // 확인 시점의 최신 목록에서 같은 PID + 시작 시각의 프로세스가 아직 있는지 다시 확인합니다. (PID 재사용 방지)
        const stillRunning = processes.some(p => (
            toSafeNumber(p.pid) === target.pid && (p.started_at ?? null) === target.started_at
        ));
        if (!stillRunning) {
            closeContextMenu();
            showToast('warning', `${target.name} (PID ${target.pid})는 이미 종료되었거나 다른 프로세스로 바뀌어 요청을 취소했습니다.`);
            return;
        }
        handleKill(target);
    };

    // 현재 보이는 컬럼의 너비 합산 (테이블 width로 사용합니다).
    const totalTableWidth = useMemo(
        () => colWidths['name'] + visibleCols.reduce((sum, c) => sum + colWidths[c.key], 0),
        [colWidths, visibleCols]
    );

    const renderRowAction = (p) => canControlProcesses && (
        <button
            type="button"
            className="pm-manager-row-action"
            aria-label={`${p.name} (PID ${p.pid}) 작업 메뉴`}
            aria-haspopup="menu"
            disabled={Boolean(killingProcesses[p.pid])}
            onClick={(event) => openActionMenu(event, p)}
        >
            ⋯
        </button>
    );

    // 행/카드 공통 이벤트: pointerdown 시 순서를 잠깐 고정해 우클릭 대상이 바뀌지 않게 합니다.
    const rowHandlers = (p) => ({
        onPointerDown: canControlProcesses ? () => freezeRowOrder(rows) : undefined,
        onContextMenu: (event) => openContextMenu(event, p),
        onKeyDown: (event) => handleRowKeyDown(event, p),
    });

    const renderUpdatedAt = () => {
        if (!lastUpdated) return '수신 대기 중';
        const d = new Date(lastUpdated);
        return Number.isNaN(d.getTime()) ? lastUpdated : d.toLocaleString('ko-KR');
    };

    return (
        <section className="pm-manager-shell d-flex flex-column gap-3 overflow-y-hidden">
            {/* ── 툴바 (고정) ── */}
            <div className="pm-manager-toolbar d-flex flex-column gap-2 flex-shrink-0">
                <div className="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
                    <div className="pm-manager-heading">
                        <h5 className="pm-manager-title">프로세스 관리자</h5>
                        <small className="pm-manager-subtitle">
                            {isConnected ? '실시간 연결 중' : '연결 대기 중'} &nbsp;·&nbsp; {renderUpdatedAt()}
                        </small>
                    </div>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="form-control form-control-sm pm-manager-search"
                        placeholder="프로세스명 · PID · 사용자"
                    />
                </div>

                {/* 컬럼 표시 토글 및 프로세스 수 */}
                <div className="pm-manager-actionbar d-flex flex-wrap align-items-center justify-content-between gap-2">
                    {/* 컬럼 표시/숨기기 드롭다운 (React state로 열림 관리 — 리렌더링 시 닫힘 방지) */}
                    <div className="dropdown" ref={colDropRef}>
                        <button
                            className="btn btn-sm process-col-toggle-btn"
                            onClick={() => setColDropOpen(prev => !prev)}
                        >
                            <i className="bi bi-layout-three-columns" aria-hidden="true"></i>
                            표시할 항목
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
                                                style={{ accentColor: 'var(--pm-primary)', width: '13px', height: '13px' }}
                                            />
                                            <span className={visible[c.key] ? 'pm-manager-value' : 'pm-manager-muted'}>
                                                {c.label}
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <small className="pm-manager-count">프로세스 수 <strong>{rows.length}개</strong></small>
                </div>
            </div>

            {/* ── 빈 상태 ── */}
            {rows.length === 0 && (
                <div className="pm-manager-empty">
                    {processes.length === 0
                        ? '프로세스 데이터 수신 대기 중입니다.'
                        : '검색 조건에 맞는 프로세스가 없습니다.'}
                </div>
            )}

            {/* ── 데스크톱 테이블 ── */}
            {rows.length > 0 && isDesktop && (
                <div className="pm-manager-table-frame d-flex flex-column flex-grow-1">
                    <div className="flex-grow-1" style={{ overflowY: 'auto', overflowX: 'auto', minWidth: 0 }}>
                        <table
                            ref={tableRef}
                            className="table table-hover align-middle mb-0 pm-manager-table"
                            style={{
                                tableLayout: 'fixed',
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
                            </colgroup>
                            <thead className="pm-manager-thead">
                                <tr>
                                    <Th ref={el => { colEls.current['name'] = el; }} col="name" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort} onResizeStart={onResizeStart}>프로세스</Th>
                                    {visibleCols.map(c => (
                                        <Th key={c.key} ref={el => { colEls.current[c.key] = el; }} col={c.key} sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort} onResizeStart={onResizeStart}>
                                            {c.label}
                                        </Th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((p) => (
                                    <tr
                                        key={rowKeyOf(p)}
                                        className={canControlProcesses ? 'pm-manager-context-row' : ''}
                                        tabIndex={canControlProcesses ? -1 : undefined}
                                        {...rowHandlers(p)}
                                    >
                                        <td style={{ overflow: 'hidden' }}>
                                            <div className="d-flex align-items-center gap-1 min-w-0">
                                                <div className="pm-manager-name text-truncate flex-grow-1">{p.name}</div>
                                                {renderRowAction(p)}
                                            </div>
                                        </td>
                                        {visibleCols.map(c => renderCell(c.key, p, heatScales))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 모바일 카드 ── */}
            {rows.length > 0 && !isDesktop && (
                <div className="pm-manager-mobile-list d-flex flex-column gap-2 overflow-y-auto flex-grow-1">
                    {rows.map((p) => (
                        <div
                            key={`${rowKeyOf(p)}-m`}
                            className="pm-manager-card card min-w-0"
                            tabIndex={canControlProcesses ? -1 : undefined}
                            {...rowHandlers(p)}
                        >
                            <div className="card-body py-2 px-3">
                                <div className="d-flex align-items-center gap-1 min-w-0">
                                    <div className="pm-manager-name text-truncate flex-grow-1">{p.name}</div>
                                    {renderRowAction(p)}
                                </div>
                                <small className="pm-manager-muted d-flex align-items-center gap-1 flex-wrap">
                                    <span>PID {p.pid}</span>
                                    <span>·</span>
                                    <span className="text-truncate" style={{ maxWidth: '120px' }}>{p.username}</span>
                                    <span>·</span>
                                    {(() => { const { label, bg } = STATUS_MAP(p.status); return <span className="pm-status-badge flex-shrink-0" style={{ backgroundColor: bg }}>{label}</span>; })()}
                                </small>
                                <div className="row row-cols-2 g-1 mt-1" style={{ fontSize: '0.82rem' }}>
                                    {visibleCols.map(c => (
                                        <div key={c.key} className="col">
                                            <span className="pm-manager-muted">{c.label} </span>
                                            <span
                                                className={HEATMAP_COLUMNS.has(c.key) ? 'pm-manager-value pm-manager-mobile-heat-value' : 'pm-manager-value'}
                                                style={getResourceHeat(c.key, p, heatScales) ?? undefined}
                                            >
                                                {renderHeatValue(c.key, p)}
                                            </span>
                                        </div>
                                    ))}
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
                    aria-label={`${contextMenu.process.name} (PID ${contextMenu.process.pid}) 작업`}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <div className="pm-manager-context-title">
                        <div className="text-truncate">{contextMenu.process.name}</div>
                        <div className="pm-manager-context-meta text-truncate">
                            PID {contextMenu.process.pid} · {contextMenu.process.username}
                        </div>
                    </div>
                    {contextMenu.confirming ? (
                        <div className="pm-manager-context-confirm">
                            <span>{contextMenu.process.name} (PID {contextMenu.process.pid} · {contextMenu.process.username})를 종료할까요?</span>
                            <div>
                                <button type="button" className="pm-manager-context-danger" onClick={confirmContextKill}>확인</button>
                                {/* 실수로 Enter를 두 번 눌러 종료되지 않도록 확인 단계에서는 취소에 포커스를 둡니다. */}
                                <button type="button" data-autofocus onClick={closeContextMenu}>취소</button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" className="pm-manager-context-danger" role="menuitem" onClick={requestContextKill}>
                            <i className="bi bi-x-lg" aria-hidden="true"></i>
                            종료
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

export default ProcessTable;
