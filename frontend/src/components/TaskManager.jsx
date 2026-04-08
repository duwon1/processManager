import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis,
    ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

// ── 리소스 동적 생성 ──────────────────────────────────────────────────────
// systemInfo가 없으면 각 카테고리당 1개 기본 항목으로 구성합니다.
function buildResources(si) {
    const base = [
        {
            key: 'cpu', type: 'cpu', label: 'CPU', index: null,
            dataKeys: ['cpu'], seriesLabels: ['CPU'],
            color: '#4fc3f7', color2: null, unit: '%', metricIds: [1],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률',
        },
        {
            key: 'memory', type: 'memory', label: '메모리', index: null,
            dataKeys: ['memory'], seriesLabels: ['메모리'],
            color: '#81c784', color2: null, unit: '%', metricIds: [3],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용',
        },
    ];

    // 디스크: 마운트포인트별 항목 (경로는 sublabel로 분리해 작게 표시)
    const disks = si?.disks ?? [null];
    disks.forEach((d, i) => {
        const mp = d?.mountpoint ?? '/';
        const label = '디스크';
        const sublabel = mp;
        base.push({
            key: `disk_${i}`, type: 'disk', label, sublabel, index: i,
            dataKeys: ['disk'], seriesLabels: ['디스크'],
            color: '#ffb74d', color2: null, unit: '%', metricIds: [4],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '활성 시간 %',
        });
    });

    // 네트워크: "네트워크 (어댑터명)" 형식으로 표시
    const networks = si?.networks ?? [null];
    networks.forEach((n, i) => {
        const adapterName = n?.adapterName;
        const label = adapterName ? `네트워크 (${adapterName})` : '네트워크';
        base.push({
            key: `network_${i}`, type: 'network', label, index: i,
            dataKeys: ['netSent', 'netRecv'], seriesLabels: ['송신', '수신'],
            color: '#9575cd', color2: '#4db6ac', unit: ' KB/s', metricIds: [5, 6],
            max: null, yTicks: null, yLabel: '처리량 (KB/s)',
        });
    });

    // GPU: GPU별 항목
    const gpus = si?.gpus ?? [null];
    gpus.forEach((g, i) => {
        const label = gpus.length > 1 ? `GPU ${i + 1}` : 'GPU';
        base.push({
            key: `gpu_${i}`, type: 'gpu', label, index: i,
            dataKeys: ['gpu'], seriesLabels: ['GPU'],
            color: '#ce93d8', color2: null, unit: '%', metricIds: [2],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률',
        });
    });

    return base;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
const getVal   = (metrics, id) => metrics.find(m => m.id === id)?.value ?? 'N/A';
const parsePct = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

const getHeaderValue = (r, metrics) =>
    r.type === 'network'
        ? `↑ ${getVal(metrics, 5)}  ↓ ${getVal(metrics, 6)}`
        : `${parsePct(getVal(metrics, r.metricIds[0])).toFixed(1)}${r.unit}`;

const getSidebarValue = (r, metrics) =>
    r.type === 'network'
        ? `↑ ${getVal(metrics, 5)}`
        : `${parsePct(getVal(metrics, r.metricIds[0])).toFixed(0)}${r.unit}`;

// ── 왼쪽 패널 미니 그래프 ────────────────────────────────────────────────
function MiniGraph({ history, resource }) {
    const colors = [resource.color, resource.color2].filter(Boolean);
    return (
        <div style={{ background: 'rgba(0,0,0,0.45)', borderRadius: 3, height: 64 }}>
            <ResponsiveContainer width="100%" height={64}>
                <AreaChart data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={[0, resource.max ?? 'auto']} />
                    {resource.dataKeys.map((dk, i) => (
                        <Area key={dk} type="monotone" dataKey={dk}
                              stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                              fillOpacity={0.2} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
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

function MainGraph({ history, resource, pcHeight = 500, mobileHeight = 200 }) {
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
            <div className="d-block d-md-none" style={{ paddingTop: 18 }} ref={mobRef}>
                <ResponsiveContainer width="100%" height={mobileHeight}>
                    <AreaChart data={history} margin={{ top: 2, right: 4, left: -16, bottom: 2 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" verticalPoints={mobPoints} />
                        <XAxis dataKey="time" interval={0} tick={makeTimeTick(10)} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, resource.max ?? 'auto']}
                               tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                               tickFormatter={v => `${v}${resource.unit}`}
                               ticks={resource.yTicks ?? undefined}
                               width={36} axisLine={false} tickLine={false} />
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
        /* flex: 1 1 72px — 줄바꿈 기준 72px, 남은 공간 채움, maxWidth로 너무 넓어지지 않게 */
        <div style={{ flex: '1 1 72px', minWidth: 72, maxWidth: 160, overflow: 'hidden' }}>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.75rem', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ color: '#e0e0e0', fontSize: '0.95rem', fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
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
    const si  = systemInfo;
    const idx = resource.index ?? 0;
    const totalThreads = processes.reduce((s, p) => s + (Number(p.thread_count) || 0), 0);

    switch (resource.type) {

        /* ── CPU ── */
        case 'cpu': return (
            <>
                {/* 실시간 */}
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                    <S label="이용률"      value={`${parsePct(getVal(metrics, 1)).toFixed(1)}%`} />
                    <S label="속도"        value={getVal(metrics, 7)} />
                    <S label="프로세스"    value={`${processes.length}`} />
                    {totalThreads > 0 && <S label="스레드" value={`${totalThreads}`} />}
                    <S label="작동 시간"   value={uptime !== null ? fmtUptime(uptime) : (si?.cpu?.uptime ?? 'N/A')} />
                </div>
                <HR />
                {/* 정적 하드웨어 */}
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
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
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                    <S   label="사용 중"   value={getVal(metrics, 8)} />
                    <SIf label="커밋됨"    value={getVal(metrics, 11) !== 'N/A' ? (si?.memory?.commitLimit ? `${getVal(metrics, 11)} / ${si.memory.commitLimit}` : getVal(metrics, 11)) : null} />
                    <SIf label="캐시됨"    value={getVal(metrics, 10) !== 'N/A' ? getVal(metrics, 10) : null} />
                    <S   label="사용 가능" value={getVal(metrics, 9)} />
                </div>
                <HR />
                <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                    <SIf label="속도"        value={si?.memory?.speedMhz} />
                    <SIf label="사용된 슬롯" value={si?.memory?.slotsUsed} />
                    <SIf label="폼팩터"      value={si?.memory?.formFactor} />
                </div>
            </>
        );

        /* ── 디스크 (배열 기반) ── */
        case 'disk': {
            const disk = si?.disks?.[idx];
            return (
                <>
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <S   label="활성 시간"  value={`${parsePct(getVal(metrics, 4)).toFixed(1)}%`} />
                        <SIf label="읽기 속도"  value={disk?.readSpeed ?? getVal(metrics, 12)} />
                        <SIf label="쓰기 속도"  value={disk?.writeSpeed ?? getVal(metrics, 13)} />
                    </div>
                    <HR />
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <SIf label="마운트"       value={disk?.mountpoint} />
                        <SIf label="용량"         value={disk?.total} />
                        <SIf label="사용됨"       value={disk?.used} />
                        <SIf label="여유 공간"    value={disk?.free} />
                        <SIf label="파일시스템"   value={disk?.fstype} />
                        <SIf label="종류"         value={disk?.type} />
                        <SIf label="제품명"       value={disk?.model} />
                    </div>
                </>
            );
        }

        /* ── 네트워크 (배열 기반) ── */
        case 'network': {
            const net = si?.networks?.[idx];
            return (
                <>
                    {/* 실시간 */}
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <S label="보내기" value={getVal(metrics, 5)} />
                        <S label="받기"   value={getVal(metrics, 6)} />
                    </div>
                    <HR />
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <SIf label="어댑터 이름" value={net?.adapterName} />
                        <SIf label="연결 형식"   value={net?.connectionType} />
                        <SIf label="IPv4 주소"   value={net?.ipv4} />
                        <SIf label="IPv6 주소"   value={net?.ipv6} />
                        <SIf label="제품명"      value={net?.model} />
                        <SIf label="SSID"        value={net?.ssid} />
                        <SIf label="신호 강도"   value={net?.signalStrength} />
                    </div>
                </>
            );
        }

        /* ── GPU (배열 기반) ── */
        case 'gpu': {
            const gpu = si?.gpus?.[idx];
            return (
                <>
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <S   label="사용률"          value={`${parsePct(getVal(metrics, 2)).toFixed(1)}%`} />
                        <SIf label="공유 GPU 메모리"  value={gpu?.sharedMemory} />
                        <SIf label="GPU 메모리"       value={gpu?.dedicatedMemory} />
                    </div>
                    <HR />
                    <div className="d-flex flex-wrap gap-2 gap-sm-3 gap-lg-4" style={{ width: '100%' }}>
                        <SIf label="드라이버 버전"  value={gpu?.driverVersion} />
                    </div>
                </>
            );
        }

        default: return null;
    }
}

// ── 왼쪽 패널 항목 (5단계 반응형) ───────────────────────────────────────
function SidebarItem({ resource, isActive, metrics, history, onClick }) {
    const ac  = resource.color;                          // active color
    const ic  = 'rgba(255,255,255,0.5)';                 // inactive color
    const col = isActive ? ac : ic;
    const bl  = `3px solid ${isActive ? ac : 'transparent'}`;
    const bb  = `2px solid ${isActive ? ac : 'transparent'}`;

    const Label = ({ size = '0.88rem', subSize = '0.72rem', gap = 4 }) => (
        <>
            <span style={{ color: col, fontSize: size, fontWeight: 600 }}>{resource.label}</span>
            {resource.sublabel && (
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: subSize, marginLeft: gap }}>
                    {resource.sublabel}
                </span>
            )}
        </>
    );
    const SubLabel = ({ size = '0.65rem' }) => resource.sublabel ? (
        <span className="text-truncate w-100 text-center d-block"
              style={{ color: 'rgba(255,255,255,0.3)', fontSize: size }}>
            {resource.sublabel}
        </span>
    ) : null;

    return (
        <button onClick={onClick}
                className="border-0 text-start flex-shrink-0"
                style={{ background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer', transition: 'background 0.15s' }}>

            {/* xl+: 미니 그래프, 155px */}
            <div className="d-none d-xl-block"
                 style={{ minWidth: 155, maxWidth: 155, borderLeft: bl, padding: '10px 12px 8px' }}>
                <div className="mb-1"><Label size="0.88rem" subSize="0.72rem" gap={4} /></div>
                <MiniGraph history={history} resource={resource} />
            </div>

            {/* lg~xl: 미니 그래프, 128px */}
            <div className="d-none d-lg-block d-xl-none"
                 style={{ minWidth: 128, maxWidth: 128, borderLeft: bl, padding: '8px 10px 6px' }}>
                <div className="mb-1"><Label size="0.82rem" subSize="0.68rem" gap={3} /></div>
                <MiniGraph history={history} resource={resource} />
            </div>

            {/* md~lg: 라벨 + 수치, 그래프 없음, 88px */}
            <div className="d-none d-md-flex d-lg-none flex-column justify-content-center"
                 style={{ minWidth: 88, maxWidth: 88, borderLeft: bl, padding: '8px 8px', minHeight: 50 }}>
                <span style={{ color: col, fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.3 }}>
                    {resource.label}
                    {resource.sublabel && (
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.64rem', marginLeft: 3 }}>
                            {resource.sublabel}
                        </span>
                    )}
                </span>
                <span style={{ color: isActive ? ac : 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                    {getSidebarValue(resource, metrics)}
                </span>
            </div>

            {/* sm~md: 수평 탭, 라벨 + 수치 */}
            <div className="d-none d-sm-flex d-md-none flex-column align-items-center justify-content-center"
                 style={{ borderBottom: bb, padding: '8px 10px 6px', flexShrink: 0, minWidth: 64 }}>
                <span className="text-truncate w-100 text-center"
                      style={{ color: col, fontSize: '0.8rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
                <SubLabel size="0.62rem" />
                <span style={{ color: isActive ? ac : 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                    {getSidebarValue(resource, metrics)}
                </span>
            </div>

            {/* xs~sm: 수평 탭, 라벨만 (가장 컴팩트) */}
            <div className="d-flex d-sm-none flex-column align-items-center justify-content-center"
                 style={{ borderBottom: bb, padding: '6px 6px 5px', flexShrink: 0, minWidth: 52 }}>
                <span className="text-truncate w-100 text-center"
                      style={{ color: col, fontSize: '0.74rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
                <SubLabel size="0.6rem" />
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
    // systemInfo 기반으로 리소스 목록 동적 생성
    const resources = useMemo(() => buildResources(systemInfo), [systemInfo]);

    const [selected, setSelected] = useState('cpu');
    // 선택된 키가 목록에 없으면 첫 항목으로 폴백
    const resource = resources.find(r => r.key === selected) ?? resources[0];

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

    // 헤더 서브타이틀: CPU 모델명, 디스크 제품명/마운트, GPU 모델명, 네트워크 어댑터명
    const getSubtitle = () => {
        const idx = resource.index ?? 0;
        switch (resource.type) {
            case 'cpu':     return systemInfo?.cpu?.model ?? null;
            case 'disk':    return systemInfo?.disks?.[idx]?.model || systemInfo?.disks?.[idx]?.mountpoint || null;
            case 'gpu':     return systemInfo?.gpus?.[idx]?.model ?? null;
            case 'network': return systemInfo?.networks?.[idx]?.adapterName ?? null;
            default:        return null;
        }
    };
    const subtitle = getSubtitle();

    return (
        <div className="d-flex flex-column flex-md-row h-100" style={{ minHeight: 0, overflowX: 'hidden' }}>

            {/* ── 왼쪽(PC) / 상단(모바일) 탭/패널 ── */}
            <div className="d-flex flex-row flex-md-column flex-md-shrink-0"
                 style={{
                     borderRight: '1px solid rgba(255,255,255,0.07)',
                     borderBottom: '1px solid rgba(255,255,255,0.07)',
                     overflowX: 'auto',   /* 모바일: 탭 가로 스크롤 허용 */
                     overflowY: 'auto',
                     flexShrink: 0,
                     /* 모바일 스크롤바 숨김 */
                     scrollbarWidth: 'none',
                     msOverflowStyle: 'none',
                 }}>
                {resources.map(r => (
                    <SidebarItem key={r.key} resource={r} isActive={resource.key === r.key}
                                 metrics={metrics} history={history} onClick={() => setSelected(r.key)} />
                ))}
            </div>

            {/* ── 오른쪽 상세 패널 ── */}
            <div className="flex-grow-1 px-2 px-sm-3" style={{ paddingTop: 10, paddingBottom: 10, minWidth: 0, width: '100%', overflowY: 'auto', overflowX: 'hidden' }}>

                {/* 메인 차트 + 리사이즈 핸들 (PC) */}
                <div className="d-none d-md-block mb-1 position-relative"
                     ref={graphContainerRef}
                     style={{ width: graphWidth ? `${graphWidth}px` : '100%', maxWidth: '100%' }}>
                    {/* 헤더: 리소스 이름 + 사용률 + 새로고침 — 컨테이너와 함께 리사이즈 */}
                    <div className="d-flex justify-content-between align-items-baseline mb-2">
                        <span style={{ color: '#fff', fontSize: '1.95rem', fontWeight: 700, lineHeight: 1.2 }}>
                            {resource.label}
                        </span>
                        <div className="d-flex align-items-baseline gap-2 flex-shrink-0">
                            {/* 장비명: 퍼센트 왼쪽에 표시 */}
                            {subtitle && (
                                <span className="d-none d-sm-inline text-truncate"
                                      style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.1rem', maxWidth: 280 }}>
                                    {subtitle}
                                </span>
                            )}
                            <span style={{ color: resource.color, fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }}>
                                {resource.type !== 'network'
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
                {/* xs: 매우 작은 화면 */}
                <div className="d-block d-sm-none mb-2">
                    <div className="d-flex justify-content-between align-items-baseline mb-1">
                        <span style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700 }}>{resource.label}</span>
                        <div className="d-flex align-items-center gap-2">
                            <span style={{ color: resource.color, fontSize: '0.95rem', fontWeight: 700 }}>
                                {resource.type !== 'network'
                                    ? `${parsePct(getVal(metrics, resource.metricIds[0])).toFixed(1)}${resource.unit}`
                                    : null}
                            </span>
                            <button onClick={onRefresh} className="btn btn-sm btn-outline-secondary"
                                    style={{ fontSize: '0.65rem', padding: '1px 5px', opacity: 0.6 }}>↻</button>
                        </div>
                    </div>
                    <MainGraph history={history} resource={resource} mobileHeight={140} />
                </div>

                {/* sm~md */}
                <div className="d-none d-sm-block d-md-none mb-3">
                    <div className="d-flex justify-content-between align-items-baseline mb-2">
                        <span style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700 }}>{resource.label}</span>
                        <div className="d-flex align-items-center gap-2">
                            <span style={{ color: resource.color, fontSize: '1.05rem', fontWeight: 700 }}>
                                {resource.type !== 'network'
                                    ? `${parsePct(getVal(metrics, resource.metricIds[0])).toFixed(1)}${resource.unit}`
                                    : null}
                            </span>
                            <button onClick={onRefresh} className="btn btn-sm btn-outline-secondary"
                                    style={{ fontSize: '0.7rem', padding: '2px 7px', opacity: 0.6 }}>↻</button>
                        </div>
                    </div>
                    <MainGraph history={history} resource={resource} mobileHeight={180} />
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
