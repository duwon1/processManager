import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    AreaChart, Area, XAxis, YAxis,
    ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

// ── 리소스 정의 ─────────────────────────────────────────────────────────────
const RESOURCES = [
    { key: 'cpu',     label: 'CPU',     dataKeys: ['cpu'],                seriesLabels: ['CPU'],          color: '#4fc3f7', color2: null,      unit: '%',    metricIds: [1],    max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률' },
    { key: 'memory',  label: '메모리',  dataKeys: ['memory'],             seriesLabels: ['메모리'],       color: '#81c784', color2: null,      unit: '%',    metricIds: [3],    max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용' },
    { key: 'disk',    label: '디스크',  dataKeys: ['disk'],               seriesLabels: ['디스크'],       color: '#ffb74d', color2: null,      unit: '%',    metricIds: [4],    max: 100, yTicks: [0,25,50,75,100], yLabel: '활성 시간 %' },
    { key: 'network', label: '네트워크',dataKeys: ['netSent','netRecv'],  seriesLabels: ['송신','수신'],  color: '#9575cd', color2: '#4db6ac', unit: ' KB/s', metricIds: [5,6],  max: null, yTicks: null,             yLabel: '처리량 (KB/s)' },
    { key: 'gpu',     label: 'GPU',     dataKeys: ['gpu'],                seriesLabels: ['GPU'],          color: '#ce93d8', color2: null,      unit: '%',    metricIds: [2],    max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률' },
];

// ── 유틸 ──────────────────────────────────────────────────────────────────
const getVal   = (metrics, id) => metrics.find(m => m.id === id)?.value ?? 'N/A';
const parsePct = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const getHeaderValue = (r, metrics) =>
    r.key === 'network'
        ? `↑ ${getVal(metrics, 5)}  ↓ ${getVal(metrics, 6)}`
        : `${parsePct(getVal(metrics, r.metricIds[0])).toFixed(1)}${r.unit}`;

const getSidebarValue = (r, metrics) =>
    r.key === 'network'
        ? `↑ ${getVal(metrics, 5)}`
        : `${parsePct(getVal(metrics, r.metricIds[0])).toFixed(0)}${r.unit}`;

// ── 왼쪽 패널 미니 그래프 ────────────────────────────────────────────────
function MiniGraph({ history, resource }) {
    const colors = [resource.color, resource.color2].filter(Boolean);
    return (
        <div style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 3, height: 46 }}>
            <ResponsiveContainer width="100%" height={46}>
                <AreaChart data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={[0, resource.max ?? 'auto']} />
                    {resource.dataKeys.map((dk, i) => (
                        <Area key={dk} type="monotone" dataKey={dk}
                              stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                              fillOpacity={0.2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ── 오른쪽 메인 차트 ─────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
    contentStyle: { background: '#1a1d23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, fontSize: '0.8rem' },
    labelStyle:   { color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' },
};

// 컨테이너 너비를 측정해 세로선 위치를 계산합니다. (MonitoringChart와 동일)
function useVerticalPoints(ref, yAxisWidth, count = 15) {
    const [points, setPoints] = useState([]);
    useEffect(() => {
        if (!ref.current) return;
        const calc = (w) => {
            const chartW = w - yAxisWidth;
            setPoints(Array.from({ length: count }, (_, i) => yAxisWidth + (i + 1) * chartW / (count + 1)));
        };
        calc(ref.current.offsetWidth);
        const ro = new ResizeObserver(entries => calc(entries[0].contentRect.width));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [ref, yAxisWidth, count]);
    return points;
}

// 첫/마지막 tick만 0s/60s로 렌더링하는 커스텀 tick
const makeTimeTick = (fontSize) => (props) => {
    const { x, y, index, visibleTicksCount } = props;
    if (index !== 0 && index !== visibleTicksCount - 1) return <g />;
    const isLast = index === visibleTicksCount - 1;
    return (
        <text x={x} y={y + 12} textAnchor={isLast ? 'end' : 'start'}
              fill="rgba(255,255,255,0.3)" fontSize={fontSize}>
            {isLast ? '60s' : '0s'}
        </text>
    );
};

function MainGraph({ history, resource, pcHeight = 500 }) {
    const colors  = [resource.color, resource.color2].filter(Boolean);
    const pcRef   = useRef(null);
    const mobRef  = useRef(null);
    const pcPoints  = useVerticalPoints(pcRef,  54);
    const mobPoints = useVerticalPoints(mobRef, 40, 8);
    return (
        <div className="position-relative"
             style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
            {/* 차트 타이틀 오버레이 */}
            <div className="position-absolute d-flex justify-content-between w-100 px-2"
                 style={{ top: 6, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem' }}>{resource.yLabel}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.68rem' }}>60초</span>
            </div>

            {/* PC */}
            <div className="d-none d-md-block" style={{ paddingTop: 22 }} ref={pcRef}>
                <ResponsiveContainer width="100%" height={pcHeight}>
                    <AreaChart data={history} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" verticalPoints={pcPoints} />
                        <XAxis dataKey="time" interval={0} tick={makeTimeTick(12)} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, resource.max ?? 'auto']}
                               tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                               tickFormatter={v => `${v}${resource.unit}`}
                               ticks={resource.yTicks ?? undefined}
                               width={54} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE}
                            formatter={(v, name) => {
                                const idx = resource.dataKeys.indexOf(name);
                                return [`${Number(v).toFixed(1)}${resource.unit}`, resource.seriesLabels[idx] ?? name];
                            }}
                        />
                        {resource.dataKeys.map((dk, i) => (
                            <Area key={dk} type="monotone" dataKey={dk}
                                  stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                                  fillOpacity={0.12} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* 모바일 */}
            <div className="d-block d-md-none" style={{ paddingTop: 22 }} ref={mobRef}>
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={history} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" verticalPoints={mobPoints} />
                        <XAxis dataKey="time" interval={0} tick={makeTimeTick(11)} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, resource.max ?? 'auto']}
                               tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                               tickFormatter={v => `${v}${resource.unit}`}
                               ticks={resource.yTicks ?? undefined}
                               width={40} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE}
                            formatter={(v, name) => {
                                const idx = resource.dataKeys.indexOf(name);
                                return [`${Number(v).toFixed(1)}${resource.unit}`, resource.seriesLabels[idx] ?? name];
                            }}
                        />
                        {resource.dataKeys.map((dk, i) => (
                            <Area key={dk} type="monotone" dataKey={dk}
                                  stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                                  fillOpacity={0.12} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ── 세부 통계 항목 ────────────────────────────────────────────────────────
function S({ label, value }) {
    return (
        <div style={{ minWidth: 100 }}>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.78rem', marginBottom: 2 }}>{label}</div>
            <div style={{ color: '#e0e0e0', fontSize: '1rem', fontWeight: 500, wordBreak: 'break-all' }}>
                {value ?? 'N/A'}
            </div>
        </div>
    );
}

// 구분선
const HR = () => (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '10px 0' }} />
);

// 값이 없거나 N/A면 렌더링하지 않는 조건부 stat 항목
const SIf = ({ label, value }) => {
    if (!value || value === 'N/A') return null;
    return <S label={label} value={value} />;
};

// ── 리소스별 전체 세부 정보 패널 ─────────────────────────────────────────
function StatsPanel({ resource, metrics, processes, systemInfo, uptime }) {
    const si = systemInfo;                          // 하드웨어 정보 (한 번 로드)
    const totalThreads = processes.reduce((s, p) => s + (Number(p.thread_count) || 0), 0);
    const runningCount = processes.filter(p => (p.status ?? '').toLowerCase().startsWith('r')).length;

    switch (resource.key) {

        /* ── CPU ── */
        case 'cpu': return (
            <>
                {/* 실시간 */}
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S label="이용률"      value={`${parsePct(getVal(metrics, 1)).toFixed(1)}%`} />
                    <S label="속도"        value={getVal(metrics, 7)} />
                    <S label="프로세스"    value={`${processes.length}`} />
                    {totalThreads > 0 && <S label="스레드" value={`${totalThreads}`} />}
                    <S label="작동 시간"   value={uptime !== null ? fmtUptime(uptime) : (si?.cpu?.uptime ?? 'N/A')} />
                </div>
                <HR />
                {/* 정적 하드웨어 */}
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S label="기본 속도"      value={si?.cpu?.baseSpeedMhz ?? 'N/A'} />
                    <S label="소켓"           value={si?.cpu?.sockets ?? 'N/A'} />
                    <S label="코어"           value={si?.cpu?.cores ?? 'N/A'} />
                    <S label="논리 프로세서"  value={si?.cpu?.logicalProcessors ?? 'N/A'} />
                    <S label="가상화"         value={si?.cpu?.virtualization ?? 'N/A'} />
                </div>
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4 mt-2">
                    <S label="L1 캐시"  value={si?.cpu?.l1Cache ?? 'N/A'} />
                    <S label="L2 캐시"  value={si?.cpu?.l2Cache ?? 'N/A'} />
                    <S label="L3 캐시"  value={si?.cpu?.l3Cache ?? 'N/A'} />
                </div>
            </>
        );

        /* ── 메모리 ── */
        case 'memory': return (
            <>
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S   label="사용 중"   value={getVal(metrics, 8)} />
                    <SIf label="커밋됨"    value={getVal(metrics, 11) !== 'N/A' ? (si?.memory?.commitLimit ? `${getVal(metrics, 11)} / ${si.memory.commitLimit}` : getVal(metrics, 11)) : null} />
                    <SIf label="캐시됨"    value={getVal(metrics, 10) !== 'N/A' ? getVal(metrics, 10) : null} />
                    <S   label="사용 가능" value={getVal(metrics, 9)} />
                </div>
                <HR />
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <SIf label="속도"        value={si?.memory?.speedMhz} />
                    <SIf label="사용된 슬롯" value={si?.memory?.slotsUsed} />
                    <SIf label="폼팩터"      value={si?.memory?.formFactor} />
                </div>
            </>
        );

        /* ── 디스크 ── */
        case 'disk': return (
            <>
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S   label="활성 시간"  value={`${parsePct(getVal(metrics, 4)).toFixed(1)}%`} />
                    <S   label="읽기 속도"  value={getVal(metrics, 12)} />
                    <S   label="쓰기 속도"  value={getVal(metrics, 13)} />
                </div>
                <HR />
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <SIf label="용량"          value={si?.disk?.capacity} />
                    <SIf label="사용됨"         value={si?.disk?.formatted} />
                    <SIf label="파일시스템"     value={si?.disk?.filesystem} />
                    <SIf label="시스템 디스크"  value={si?.disk?.isSystemDisk != null ? (si.disk.isSystemDisk ? '예' : '아니오') : null} />
                    <SIf label="종류"           value={si?.disk?.type} />
                </div>
            </>
        );

        /* ── 네트워크 ── */
        case 'network': return (
            <>
                {/* 실시간 */}
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S label="보내기" value={getVal(metrics, 5)} />
                    <S label="받기"   value={getVal(metrics, 6)} />
                </div>
                <HR />
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <SIf label="어댑터 이름" value={si?.network?.adapterName} />
                    <SIf label="SSID"        value={si?.network?.ssid} />
                    <SIf label="연결 형식"   value={si?.network?.connectionType} />
                    <SIf label="IPv4 주소"   value={si?.network?.ipv4} />
                    <SIf label="IPv6 주소"   value={si?.network?.ipv6} />
                    <SIf label="신호 강도"   value={si?.network?.signalStrength} />
                </div>
            </>
        );

        /* ── GPU ── */
        case 'gpu': return (
            <>
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <S   label="사용률"          value={`${parsePct(getVal(metrics, 2)).toFixed(1)}%`} />
                    <SIf label="공유 GPU 메모리"  value={si?.gpu?.sharedMemory} />
                    <SIf label="GPU 메모리"       value={si?.gpu?.dedicatedMemory} />
                </div>
                <HR />
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4">
                    <SIf label="드라이버 버전"  value={si?.gpu?.driverVersion} />
                </div>
            </>
        );

        default: return null;
    }
}

// ── 왼쪽 패널 항목 ────────────────────────────────────────────────────────
function SidebarItem({ resource, isActive, metrics, history, onClick }) {
    return (
        <button onClick={onClick}
                className="border-0 text-start flex-shrink-0"
                style={{
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                }}>

            {/* lg+: 미니 그래프 포함 세로 레이아웃 */}
            <div className="d-none d-lg-block"
                 style={{
                     minWidth: 152, maxWidth: 152,
                     borderLeft: `3px solid ${isActive ? resource.color : 'transparent'}`,
                     padding: '10px 12px 8px',
                 }}>
                <div className="mb-1">
                    <span style={{ color: isActive ? resource.color : 'rgba(255,255,255,0.5)', fontSize: '0.88rem', fontWeight: 600 }}>
                        {resource.label}
                    </span>
                </div>
                <MiniGraph history={history} resource={resource} />
            </div>

            {/* md~lg: 라벨 + 현재 수치, 미니 그래프 없음 */}
            <div className="d-none d-md-flex d-lg-none flex-column justify-content-center"
                 style={{
                     minWidth: 100, maxWidth: 100,
                     borderLeft: `3px solid ${isActive ? resource.color : 'transparent'}`,
                     padding: '10px 10px',
                     minHeight: 54,
                 }}>
                <span style={{ color: isActive ? resource.color : 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
                <span style={{ color: isActive ? resource.color : 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>
                    {getSidebarValue(resource, metrics)}
                </span>
            </div>

            {/* xs~md: 상단 탭 바, 라벨만 */}
            <div className="d-flex d-md-none flex-column align-items-center justify-content-center"
                 style={{
                     borderBottom: `2px solid ${isActive ? resource.color : 'transparent'}`,
                     padding: '8px 4px 6px',
                     flex: 1,
                     minWidth: 0,
                 }}>
                <span className="text-truncate w-100 text-center"
                      style={{ color: isActive ? resource.color : 'rgba(255,255,255,0.5)', fontSize: '0.82rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
            </div>
        </button>
    );
}

// "HH:MM:SS" 문자열 → 초
const parseUptime = (str) => {
    if (!str) return null;
    const parts = str.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// 초 → "HH:MM:SS"
const fmtUptime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
function TaskManager({ metrics, history, processes, systemInfo, onRefresh }) {
    const [selected, setSelected] = useState('cpu');
    const resource = RESOURCES.find(r => r.key === selected);

    // 그래프 리사이즈 (세로·가로·대각)
    const [graphHeight, setGraphHeight] = useState(500);
    const [graphWidth, setGraphWidth]   = useState(null); // null = 100%
    const graphHeightRef     = useRef(500);
    const graphWidthRef      = useRef(null);
    const graphContainerRef  = useRef(null);
    const createDragHandler  = useCallback((mode) => (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        // 가로 드래그 시작 시 현재 컨테이너 너비를 초기값으로 사용
        if ((mode === 'x' || mode === 'xy') && !graphWidthRef.current && graphContainerRef.current) {
            graphWidthRef.current = graphContainerRef.current.offsetWidth;
            setGraphWidth(graphWidthRef.current);
        }
        const startW = graphWidthRef.current;
        const startH = graphHeightRef.current;
        const onMove = (e) => {
            if (mode === 'y' || mode === 'xy') {
                const h = Math.max(150, Math.min(900, startH + e.clientY - startY));
                graphHeightRef.current = h;
                setGraphHeight(h);
            }
            if (mode === 'x' || mode === 'xy') {
                const w = Math.max(200, startW + e.clientX - startX);
                graphWidthRef.current = w;
                setGraphWidth(w);
            }
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    // 작동 시간 실시간 카운터
    const [uptime, setUptime] = useState(null);
    const uptimeBaseRef = useRef(null);
    useEffect(() => {
        const base = parseUptime(systemInfo?.cpu?.uptime);
        if (base === null) return;
        uptimeBaseRef.current = base;
        setUptime(base);
        const timer = setInterval(() => {
            uptimeBaseRef.current += 1;
            setUptime(uptimeBaseRef.current);
        }, 1000);
        return () => clearInterval(timer);
    }, [systemInfo?.cpu?.uptime]);

    if (!metrics || metrics.length === 0) {
        return (
            <div className="d-flex flex-column align-items-center justify-content-center h-100"
                 style={{ color: 'rgba(255,255,255,0.4)' }}>
                <div className="spinner-border mb-3 text-info" role="status" />
                <span style={{ fontSize: '0.9rem' }}>데이터 수신 대기 중...</span>
            </div>
        );
    }

    return (
        <div className="d-flex flex-column flex-md-row h-100" style={{ minHeight: 0 }}>

            {/* ── 왼쪽(PC) / 상단(모바일) 패널 ── */}
            <div className="d-flex flex-row flex-md-column flex-md-shrink-0"
                 style={{
                     borderRight: '1px solid rgba(255,255,255,0.07)',
                     borderBottom: '1px solid rgba(255,255,255,0.07)',
                     overflowX: 'hidden',
                     overflowY: 'auto',
                 }}>
                {RESOURCES.map(r => (
                    <SidebarItem key={r.key} resource={r} isActive={selected === r.key}
                                 metrics={metrics} history={history} onClick={() => setSelected(r.key)} />
                ))}
            </div>

            {/* ── 오른쪽 상세 패널 ── */}
            <div className="flex-grow-1 overflow-y-auto" style={{ padding: '10px 12px' }}>

                {/* 메인 차트 + 리사이즈 핸들 (PC) */}
                <div className="d-none d-md-block mb-1 position-relative"
                     ref={graphContainerRef}
                     style={{ width: graphWidth ? `${graphWidth}px` : '100%', maxWidth: '100%' }}>
                    {/* 헤더: 리소스 이름 + 사용률 + 새로고침 — 컨테이너와 함께 리사이즈 */}
                    <div className="d-flex justify-content-between align-items-baseline mb-2">
                        <div className="d-flex align-items-baseline gap-2 flex-wrap" style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ color: '#fff', fontSize: '1.95rem', fontWeight: 700, lineHeight: 1.2 }}>
                                {resource.label}
                            </span>
                            {selected === 'cpu' && systemInfo?.cpu?.model && (
                                <span className="d-none d-sm-inline text-truncate"
                                      style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.84rem' }}>
                                    {systemInfo.cpu.model}
                                </span>
                            )}
                            {selected === 'gpu' && systemInfo?.gpu?.model && (
                                <span className="d-none d-sm-inline text-truncate"
                                      style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.84rem' }}>
                                    {systemInfo.gpu.model}
                                </span>
                            )}
                        </div>
                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            <span style={{ color: resource.color, fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }}>
                                {resource.key !== 'network'
                                    ? `${parsePct(getVal(metrics, resource.metricIds[0])).toFixed(1)}${resource.unit}`
                                    : null}
                            </span>
                            <button onClick={onRefresh}
                                    className="btn btn-sm btn-outline-secondary"
                                    style={{ fontSize: '0.7rem', padding: '2px 7px', opacity: 0.6 }}
                                    title="하드웨어 정보 새로 고침">
                                ↻
                            </button>
                        </div>
                    </div>
                    <MainGraph history={history} resource={resource} pcHeight={graphHeight} />
                    {/* 하단 핸들 (세로) */}
                    <div className="d-flex align-items-center justify-content-center"
                         onMouseDown={createDragHandler('y')}
                         style={{ height: 12, cursor: 'ns-resize', marginTop: 2 }}>
                        <div style={{ width: 48, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                    </div>
                    {/* 우측 핸들 (가로) */}
                    <div className="position-absolute d-flex align-items-center justify-content-center"
                         onMouseDown={createDragHandler('x')}
                         style={{ top: 0, right: -10, width: 12, bottom: 12, cursor: 'ew-resize' }}>
                        <div style={{ width: 3, height: 48, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                    </div>
                    {/* 우하단 핸들 (대각) */}
                    <div className="position-absolute"
                         onMouseDown={createDragHandler('xy')}
                         style={{ right: -10, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRight: '2px solid rgba(255,255,255,0.3)',
                                      borderBottom: '2px solid rgba(255,255,255,0.3)', borderRadius: '0 0 2px 0' }} />
                    </div>
                </div>
                {/* 모바일: 헤더 + 차트 */}
                <div className="d-block d-md-none mb-3">
                    <div className="d-flex justify-content-between align-items-baseline mb-2">
                        <span style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{resource.label}</span>
                        <div className="d-flex align-items-center gap-2">
                            <span style={{ color: resource.color, fontSize: '1.1rem', fontWeight: 700 }}>
                                {resource.key !== 'network'
                                    ? `${parsePct(getVal(metrics, resource.metricIds[0])).toFixed(1)}${resource.unit}`
                                    : null}
                            </span>
                            <button onClick={onRefresh} className="btn btn-sm btn-outline-secondary"
                                    style={{ fontSize: '0.7rem', padding: '2px 7px', opacity: 0.6 }}>↻</button>
                        </div>
                    </div>
                    <MainGraph history={history} resource={resource} pcHeight={200} />
                </div>

                {/* 세부 통계 */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                    {!systemInfo ? (
                        <div className="d-flex align-items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
                            <div className="spinner-border spinner-border-sm" role="status" style={{ width: '0.8rem', height: '0.8rem' }} />
                            하드웨어 정보 수집 중...
                        </div>
                    ) : (
                        <StatsPanel resource={resource} metrics={metrics} processes={processes} systemInfo={systemInfo} uptime={uptime} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default TaskManager;
