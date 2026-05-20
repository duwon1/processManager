import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis,
    ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

const CPU_LOGICAL_COLORS = [
    '#4fc3f7',
    '#81c784',
    '#ffb74d',
    '#9575cd',
    '#4db6ac',
    '#f06292',
    '#64b5f6',
    '#dce775',
    '#ba68c8',
    '#90a4ae',
    '#ff8a65',
    '#a1887f',
];

function formatPartitionList(value, wrap = false) {
    if (!value) return null;
    const parts = String(value)
        .split(/\s*,\s*/)
        .map(part => part.trim())
        .filter(Boolean);
    const text = parts.length > 0 ? parts.join(' · ') : null;
    return text && wrap ? `(${text})` : text;
}

const sameDisk = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        (left.device && right.device && left.device === right.device) ||
        (left.partitions && right.partitions && left.partitions === right.partitions) ||
        (left.mountpoint && right.mountpoint && left.mountpoint === right.mountpoint)
    );
};

const mergeLiveDisk = (disk, liveDisks, index) => {
    const liveDisk = Array.isArray(liveDisks)
        ? liveDisks.find(candidate => sameDisk(candidate, disk)) ?? liveDisks[index]
        : null;
    return liveDisk ? { ...(disk ?? {}), ...liveDisk } : disk;
};

const sameNetwork = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        left.adapterName &&
        right.adapterName &&
        String(left.adapterName).toLowerCase() === String(right.adapterName).toLowerCase()
    );
};

const mergeLiveNetwork = (network, liveNetworks, index) => {
    const liveNetwork = Array.isArray(liveNetworks)
        ? liveNetworks.find(candidate => sameNetwork(candidate, network)) ?? liveNetworks[index]
        : null;
    return liveNetwork ? { ...(network ?? {}), ...liveNetwork } : network;
};

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
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률',
        },
    ];

    // 디스크: 물리 디스크별 항목. 포함 파티션은 sublabel로 표시합니다.
    const disks = si?.disks ?? [null];
    disks.forEach((d, i) => {
        const mp = formatPartitionList(d?.partitions ?? d?.mountpoint) ?? '/';
        const label = '디스크';
        const sublabel = mp;
        const dataKey = d ? `disk_${i}` : 'disk';
        base.push({
            key: `disk_${i}`, type: 'disk', label, sublabel, index: i,
            dataKeys: [dataKey], seriesLabels: ['디스크'],
            color: '#ffb74d', color2: null, unit: '%', metricIds: [4],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '디스크 사용률 %',
            fallbackPercent: Number.isFinite(Number(d?.activeTimePercent ?? d?.usagePercent))
                ? Number(d?.activeTimePercent ?? d?.usagePercent)
                : null,
        });
    });

    // 네트워크: 기본 라벨과 어댑터명을 분리해 좁은 사이드바에서도 비율이 깨지지 않게 합니다.
    const networks = si?.networks ?? [null];
    networks.forEach((n, i) => {
        const adapterName = n?.adapterName;
        const label = '네트워크';
        const sentKey = n ? `network_${i}_sent` : 'netSent';
        const recvKey = n ? `network_${i}_recv` : 'netRecv';
        base.push({
            key: `network_${i}`, type: 'network', label, sublabel: adapterName, index: i,
            dataKeys: [sentKey, recvKey], seriesLabels: ['송신', '수신'],
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
const getMetric = (metrics, id) => Array.isArray(metrics) ? metrics.find(m => m.id === id) : null;
const getMetricRaw = (metrics, id) => {
    const metric = getMetric(metrics, id);
    return metric?.rawValue ?? metric?.value ?? null;
};

const getCpuLogicalValues = (metrics) => {
    const value = getMetricRaw(metrics, 17);
    return Array.isArray(value)
        ? value.map(item => Number(item)).filter(item => Number.isFinite(item))
        : [];
};

const ITEM_LABELS = {
    hostname: '호스트명',
    kernelSystem: '커널 종류',
    kernelRelease: '커널 릴리스',
    kernelVersion: '커널 버전',
    architecture: '아키텍처',
    bootTimeEpochSeconds: '부팅 시각',
    uptimeSeconds: '가동 시간',
    model: '모델',
    sockets: '소켓',
    cores: '코어',
    logicalProcessors: '논리 프로세서',
    baseSpeedMhz: '기본 속도',
    currentSpeedMhz: '현재 속도',
    virtualization: '가상화',
    l1CacheBytes: 'L1 캐시',
    l2CacheBytes: 'L2 캐시',
    l3CacheBytes: 'L3 캐시',
    totalBytes: '전체',
    usedBytes: '사용 중',
    inUseBytes: '사용 중',
    availableBytes: '사용 가능',
    cachedBytes: '캐시됨',
    committedBytes: '커밋됨',
    commitLimitBytes: '커밋 한도',
    pagedPoolBytes: '페이징 풀',
    nonPagedPoolBytes: '비페이징 풀',
    hardwareReservedBytes: '하드웨어 예약',
    freeBytes: '여유 공간',
    usagePercent: '사용률',
    activeTimePercent: '활성 시간',
    capacityUsagePercent: '용량 사용률',
    swapTotalBytes: '스왑 전체',
    swapUsedBytes: '스왑 사용 중',
    speedMtPerSecond: '속도',
    slotsUsed: '사용된 슬롯',
    slotsTotal: '전체 슬롯',
    installedBytes: '설치됨',
    formFactor: '폼팩터',
    mountpoint: '마운트',
    partitions: '파티션',
    device: '장치',
    filesystem: '파일시스템',
    readBytesPerSecond: '읽기 속도',
    writeBytesPerSecond: '쓰기 속도',
    averageResponseTimeMs: '평균 응답 시간',
    queueLength: '큐 길이',
    diskType: '종류',
    adapterName: '어댑터 이름',
    connectionType: '연결 형식',
    ipv4: 'IPv4 주소',
    ipv6: 'IPv6 주소',
    speedBitsPerSecond: '링크 속도',
    macAddress: 'MAC 주소',
    ssid: 'SSID',
    signalStrengthDbm: '신호 강도',
    driverVersion: '드라이버 버전',
    dedicatedMemoryBytes: '전용 메모리',
    usedMemoryBytes: '사용 중 메모리',
    sharedMemoryBytes: '공유 메모리',
    gpuMemoryUsedBytes: 'GPU 메모리 사용 중',
    gpuMemoryTotalBytes: 'GPU 메모리 전체',
    dedicatedMemoryUsedBytes: '전용 GPU 메모리 사용 중',
    dedicatedMemoryTotalBytes: '전용 GPU 메모리 전체',
    dedicatedSystemMemoryBytes: '전용 시스템 메모리',
    hardwareReservedMemoryBytes: '하드웨어 예약',
    sharedMemoryUsedBytes: '공유 GPU 메모리 사용 중',
    sharedMemoryTotalBytes: '공유 GPU 메모리 전체',
    displayMemoryBytes: '표시 메모리',
    temperatureCelsius: '온도',
    driverDate: '드라이버 날짜',
    directXVersion: 'DirectX 버전',
    ddiVersion: 'DDI 버전',
    featureLevels: '기능 수준',
    driverModel: '드라이버 모델',
};

const TEXT_VALUE_LABELS = {
    available: '사용 가능',
    unavailable: '사용 불가',
    wifi: 'Wi-Fi',
    ethernet: '이더넷',
};

const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let next = Math.abs(bytes);
    let unitIndex = 0;
    while (next >= 1024 && unitIndex < units.length - 1) {
        next /= 1024;
        unitIndex += 1;
    }
    const sign = bytes < 0 ? '-' : '';
    const precision = unitIndex === 0 || next >= 100 ? 0 : 1;
    return `${sign}${next.toFixed(precision)} ${units[unitIndex]}`;
};

const formatDuration = (seconds) => {
    const total = Number(seconds);
    if (!Number.isFinite(total)) return null;
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    if (days > 0) return `${days}일 ${hours}시간 ${minutes}분`;
    if (hours > 0) return `${hours}시간 ${minutes}분`;
    if (minutes > 0) return `${minutes}분 ${secs}초`;
    return `${secs}초`;
};

const formatByUnit = (value, unit) => {
    if (value === null || value === undefined || value === '' || value === 'N/A') return null;

    switch (unit) {
        case 'bytes':
            return formatBytes(value);
        case 'bytesPerSecond': {
            const formatted = formatBytes(value);
            return formatted ? `${formatted}/s` : null;
        }
        case 'bitsPerSecond': {
            const n = Number(value);
            if (!Number.isFinite(n)) return null;
            if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Gbps`;
            if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} Mbps`;
            if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)} Kbps`;
            return `${n.toFixed(0)} bps`;
        }
        case 'seconds':
            return formatDuration(value);
        case 'epochSeconds': {
            const date = new Date(Number(value) * 1000);
            return Number.isNaN(date.getTime()) ? null : date.toLocaleString('ko-KR');
        }
        case 'percent': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)}%` : null;
        }
        case 'mhz': {
            const n = Number(value);
            if (!Number.isFinite(n)) return null;
            return n >= 1000 ? `${(n / 1000).toFixed(2)} GHz` : `${n.toFixed(0)} MHz`;
        }
        case 'mtPerSecond': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n.toFixed(0)} MT/s` : null;
        }
        case 'dbm': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n} dBm` : null;
        }
        case 'ms': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)} ms` : null;
        }
        case 'celsius': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)} °C` : null;
        }
        case 'count': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n}` : null;
        }
        default:
            return TEXT_VALUE_LABELS[value] ?? String(value);
    }
};

const formatSectionValue = (item) => formatByUnit(item?.value, item?.unit);

const formatMetricValue = (metric) => {
    const value = metric?.rawValue ?? metric?.value;
    return formatByUnit(value, metric?.unit) ?? 'N/A';
};

const getVal = (metrics, id) => formatMetricValue(getMetric(metrics, id));
const getPct = (metrics, id) => {
    const value = getMetricRaw(metrics, id);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const fallback = parseFloat(value);
    return Number.isFinite(fallback) ? fallback : 0;
};

const getResourcePct = (resource, metrics) =>
    Number.isFinite(Number(resource?.fallbackPercent))
        ? Number(resource.fallbackPercent)
        : getPct(metrics, resource.metricIds[0]);

const getLatestHistoryValue = (history, key) => {
    const latest = Array.isArray(history) ? history[history.length - 1] : null;
    const value = Number(latest?.[key]);
    return Number.isFinite(value) ? value : null;
};

const getCpuLogicalPercent = (key, metrics, history) => {
    const fromHistory = getLatestHistoryValue(history, key);
    if (fromHistory !== null) return fromHistory;

    const match = /^cpu_logical_(\d+)$/.exec(key);
    if (!match) return null;

    const value = getCpuLogicalValues(metrics)[Number(match[1])];
    return Number.isFinite(value) ? value : null;
};

const getResourcePercent = (resource, metrics, history) => {
    if (resource.type === 'disk') {
        const dataKey = resource.dataKeys?.[0];
        const fromHistory = dataKey ? getLatestHistoryValue(history, dataKey) : null;
        if (fromHistory !== null) return fromHistory;
        if (Number.isFinite(Number(resource?.fallbackPercent))) return Number(resource.fallbackPercent);
        return dataKey === 'disk' ? getPct(metrics, resource.metricIds[0]) : 0;
    }
    return getResourcePct(resource, metrics);
};

const formatNetworkChartValue = (kilobytesPerSecond) => {
    const value = Number(kilobytesPerSecond);
    return Number.isFinite(value) ? formatByUnit(value * 1024, 'bytesPerSecond') ?? '0 B/s' : '0 B/s';
};

const getNetworkResourceValues = (resource, metrics, history) => {
    const sent = getLatestHistoryValue(history, resource?.dataKeys?.[0]);
    const recv = getLatestHistoryValue(history, resource?.dataKeys?.[1]);
    if (sent !== null || recv !== null) {
        return {
            sent: formatNetworkChartValue(sent ?? 0),
            recv: formatNetworkChartValue(recv ?? 0),
        };
    }
    return {
        sent: getVal(metrics, 5),
        recv: getVal(metrics, 6),
    };
};

const formatChartValue = (value, resource) =>
    resource.type === 'network'
        ? formatNetworkChartValue(value)
        : `${Number(value).toFixed(1)}${resource.unit}`;

const getResourceHeadlineValue = (resource, metrics, history) => {
    if (resource.type === 'network') {
        const values = getNetworkResourceValues(resource, metrics, history);
        return `↑ ${values.sent}  ↓ ${values.recv}`;
    }
    return `${getResourcePercent(resource, metrics, history).toFixed(1)}${resource.unit}`;
};

const getSidebarValue = (r, metrics, history) =>
    r.type === 'network'
        ? `↑ ${getNetworkResourceValues(r, metrics, history).sent}`
        : `${getResourcePercent(r, metrics, history).toFixed(0)}${r.unit}`;

// ── 왼쪽 패널 미니 그래프 ────────────────────────────────────────────────
function MiniGraph({ history, resource }) {
    const colors = resource.colors ?? [resource.color, resource.color2].filter(Boolean);
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
    const colors  = resource.colors ?? [resource.color, resource.color2].filter(Boolean);
    const pcRef   = useRef(null);
    const mobRef  = useRef(null);
    const pcYAxisWidth = resource.type === 'network' ? 72 : 54;
    const mobYAxisWidth = resource.type === 'network' ? 58 : 46;
    const pcPoints  = useVerticalPoints(pcRef, pcYAxisWidth);
    const mobPoints = useVerticalPoints(mobRef, mobYAxisWidth, 8);
    return (
        <div className="position-relative"
             style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
            {/* 차트 타이틀 오버레이 */}
            <div className="position-absolute d-none d-md-flex justify-content-between w-100 px-2"
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
                               tickFormatter={v => formatChartValue(v, resource)}
                               ticks={resource.yTicks ?? undefined}
                               width={pcYAxisWidth} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE}
                            formatter={(v, name) => {
                                const idx = resource.dataKeys.indexOf(name);
                                return [formatChartValue(v, resource), resource.seriesLabels[idx] ?? name];
                            }}
                        />
                        {resource.dataKeys.map((dk, i) => (
                            <Area key={dk} type="monotone" dataKey={dk}
                                  stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                                  fillOpacity={0.12}
                                  strokeWidth={1.5}
                                  dot={false} activeDot={false} isAnimationActive={false} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* 모바일 */}
            <div className="d-block d-md-none" style={{ paddingTop: 8 }} ref={mobRef}>
                <ResponsiveContainer width="100%" height={mobileHeight}>
                    <AreaChart data={history} margin={{ top: 4, right: 6, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" verticalPoints={mobPoints} />
                        <XAxis dataKey="time" interval={0} tick={makeTimeTick(9)} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, resource.max ?? 'auto']}
                               tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                               tickFormatter={v => formatChartValue(v, resource)}
                               ticks={resource.yTicks ?? undefined}
                               width={mobYAxisWidth} axisLine={false} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE}
                            formatter={(v, name) => {
                                const idx = resource.dataKeys.indexOf(name);
                                return [formatChartValue(v, resource), resource.seriesLabels[idx] ?? name];
                            }}
                        />
                        {resource.dataKeys.map((dk, i) => (
                            <Area key={dk} type="monotone" dataKey={dk}
                                  stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                                  fillOpacity={0.12}
                                  strokeWidth={1.5}
                                  dot={false} activeDot={false} isAnimationActive={false} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ── 세부 통계 항목 ────────────────────────────────────────────────────────
function CpuLogicalGraphs({ history, resources, metrics }) {
    if (!Array.isArray(resources) || resources.length === 0) return null;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: 10,
                width: '100%',
            }}
        >
            {resources.map((cpuResource, index) => {
                const percent = getCpuLogicalPercent(cpuResource.dataKeys[0], metrics, history);
                return (
                    <div
                        key={cpuResource.key}
                        style={{
                            minWidth: 0,
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 6,
                            padding: 8,
                            background: 'rgba(255,255,255,0.025)',
                        }}
                    >
                        <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                            <span
                                className="text-truncate"
                                style={{ color: cpuResource.color, fontSize: '0.76rem', fontWeight: 700 }}
                            >
                                논리 {index + 1}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', fontWeight: 600 }}>
                                {percent === null ? 'N/A' : `${percent.toFixed(1)}%`}
                            </span>
                        </div>
                        <MainGraph history={history} resource={cpuResource} pcHeight={118} mobileHeight={92} />
                    </div>
                );
            })}
        </div>
    );
}

const STAT_GRID_STYLE = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 156px))',
    gridAutoFlow: 'row',
    gap: '8px 16px',
    width: '100%',
    maxWidth: 672,
    justifyContent: 'start',
    alignItems: 'start',
};

const SECONDARY_GRID_STYLE = {
    ...STAT_GRID_STYLE,
    gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))',
    gap: '6px 12px',
    maxWidth: 'none',
};

function InfoSplit({ primary, secondary }) {
    const primaryItems = React.Children.toArray(primary).filter(Boolean);
    const secondaryItems = React.Children.toArray(secondary).filter(Boolean);

    return (
        // 핵심 정보는 왼쪽에 크게, 보조 정보는 오른쪽에 작게 배치합니다.
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px 22px', width: '100%' }}>
            <StatGrid variant="primary" style={{ flex: '1 1 420px' }}>
                {primaryItems}
            </StatGrid>
            {secondaryItems.length > 0 && (
                <div style={{ flex: '0 1 320px', minWidth: 'min(240px, 100%)' }}>
                    {secondaryItems}
                </div>
            )}
        </div>
    );
}

function StatGrid({ children, className = '', style, variant = 'primary' }) {
    const items = React.Children.toArray(children).filter(Boolean);
    if (items.length === 0) return null;
    const baseStyle = variant === 'secondary' ? SECONDARY_GRID_STYLE : STAT_GRID_STYLE;

    return (
        // 통계 항목은 최대 4열에 가깝게 제한해 한 줄에 몰리지 않고 순서대로 줄바꿈되게 합니다.
        <div className={className} style={{ ...baseStyle, ...style }}>
            {items}
        </div>
    );
}

function S({ label, value, variant = 'primary' }) {
    const displayValue = value ?? 'N/A';
    const compact = variant === 'secondary';
    return (
        /* grid 셀 안에서 긴 값만 줄바꿈하고, 한글 단어는 글자 단위로 쪼개지지 않게 합니다. */
        <div title={`${label}: ${displayValue}`} style={{ minWidth: 0, minHeight: compact ? 30 : 46, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: compact ? '0.68rem' : '0.76rem', lineHeight: 1.25, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ color: '#e0e0e0', fontSize: compact ? '0.82rem' : '1.18rem', fontWeight: compact ? 500 : 600, lineHeight: compact ? 1.25 : 1.16, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                {displayValue}
            </div>
        </div>
    );
}

// 값이 없거나 N/A면 렌더링하지 않는 조건부 stat 항목
const SIf = ({ label, value, variant = 'primary' }) => {
    if (value === null || value === undefined || value === '' || value === 'N/A') return null;
    return <S label={label} value={value} variant={variant} />;
};

const formatPair = (current, total, unit) => {
    const currentText = formatByUnit(current, unit);
    const totalText = formatByUnit(total, unit);
    if (currentText && totalText) return `${currentText} / ${totalText}`;
    return currentText ?? totalText;
};

const DETAIL_DUPLICATE_KEYS_BY_TYPE = {
    cpu: new Set([
        'model',
        'uptimeSeconds',
        'sockets',
        'cores',
        'logicalProcessors',
        'baseSpeedMhz',
        'currentSpeedMhz',
        'virtualization',
    ]),
    memory: new Set([
        'totalBytes',
        'usedBytes',
        'availableBytes',
        'cachedBytes',
        'committedBytes',
        'commitLimitBytes',
        'pagedPoolBytes',
        'nonPagedPoolBytes',
        'hardwareReservedBytes',
        'usagePercent',
        'installedBytes',
        'speedMtPerSecond',
        'slotsUsed',
        'slotsTotal',
        'formFactor',
    ]),
    disk: new Set([
        'mountpoint',
        'partitions',
        'filesystem',
        'totalBytes',
        'usedBytes',
        'freeBytes',
        'usagePercent',
        'activeTimePercent',
        'capacityUsagePercent',
        'readBytesPerSecond',
        'writeBytesPerSecond',
        'averageResponseTimeMs',
        'queueLength',
        'diskType',
        'device',
    ]),
    network: new Set([
        'adapterName',
        'connectionType',
        'ipv4',
        'ipv6',
        'speedBitsPerSecond',
        'macAddress',
        'ssid',
        'signalStrengthDbm',
    ]),
    gpu: new Set([
        'model',
        'driverVersion',
        'dedicatedMemoryBytes',
        'usedMemoryBytes',
        'sharedMemoryBytes',
        'gpuMemoryUsedBytes',
        'gpuMemoryTotalBytes',
        'dedicatedMemoryUsedBytes',
        'dedicatedMemoryTotalBytes',
        'dedicatedSystemMemoryBytes',
        'hardwareReservedMemoryBytes',
        'sharedMemoryUsedBytes',
        'sharedMemoryTotalBytes',
        'displayMemoryBytes',
        'temperatureCelsius',
        'driverDate',
        'directXVersion',
        'ddiVersion',
        'featureLevels',
        'driverModel',
        'usagePercent',
    ]),
};

function filterSectionsForResource(sections, resource) {
    if (!Array.isArray(sections) || !resource) return [];

    const index = resource.index ?? 0;
    const scopeByType = {
        cpu: ['cpu'],
        memory: ['memory'],
        disk: ['disks'],
        network: ['networks'],
        gpu: ['gpus'],
    };
    const allowedScopes = scopeByType[resource.type] ?? [];
    const groupPrefixByType = {
        disk: 'disk',
        network: 'network',
        gpu: 'gpu',
    };
    const groupPrefix = groupPrefixByType[resource.type];

    // 선택한 리소스의 OS별 상세만 남기고, 중복 키 제거는 렌더 단계에서 처리합니다.
    return sections
        .filter(section => allowedScopes.some(scope => section.key?.endsWith(`.${scope}`)))
        .map(section => {
            if (!groupPrefix || !Array.isArray(section.groups)) return section;

            return {
                ...section,
                groups: section.groups.filter(group => group.key === `${groupPrefix}.${index}`),
            };
        });
}

function SystemSections({ sections, resource }) {
    if (!Array.isArray(sections) || sections.length === 0) return null;

    const duplicateKeys = DETAIL_DUPLICATE_KEYS_BY_TYPE[resource?.type] ?? new Set();
    // 선택 리소스의 상세 항목을 핵심 통계 아래에 이어서 한 번에 보여줍니다.
    const renderItems = (items = []) => items
        .filter(item => !duplicateKeys.has(item?.key))
        .map(item => ({ item, formatted: formatSectionValue(item) }))
        .filter(({ formatted }) => formatted !== null)
        .map(({ item, formatted }) => (
            <S key={item.key} label={ITEM_LABELS[item.key] ?? item.key} value={formatted} variant="secondary" />
        ));

    const visibleSections = filterSectionsForResource(sections, resource)
        .map(section => {
            const itemNodes = renderItems(section.items);
            const groups = (Array.isArray(section.groups) ? section.groups : [])
                .map(group => ({
                    ...group,
                    groupNodes: renderItems(group.items),
                }))
                .filter(group => group.groupNodes.length > 0);

            return { ...section, itemNodes, groups };
        })
        .filter(section => section.itemNodes.length > 0 || section.groups.length > 0);

    if (visibleSections.length === 0) return null;

    return (
        <>
            {visibleSections.map(section => (
                <div key={section.key} className="mb-3">
                    {section.itemNodes.length > 0 && (
                        <StatGrid variant="secondary">
                            {section.itemNodes}
                        </StatGrid>
                    )}
                    {section.groups.map(group => (
                        <StatGrid key={group.key} className="mt-2" variant="secondary">
                            {group.groupNodes}
                        </StatGrid>
                    ))}
                </div>
            ))}
        </>
    );
}

function SystemInfoSection({ sections }) {
    if (!Array.isArray(sections) || sections.length === 0) return null;

    const systemSection = sections.find(section => section.key?.endsWith('.system'));
    const items = systemSection?.items
        ?.map(item => ({ item, formatted: formatSectionValue(item) }))
        .filter(({ formatted }) => formatted !== null) ?? [];

    if (items.length === 0) return null;

    return (
        <details style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 12, paddingTop: 10 }}>
            <summary style={{ color: 'rgba(255,255,255,0.62)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                시스템 정보
            </summary>
            <StatGrid className="mt-2" variant="secondary">
                {items.map(({ item, formatted }) => (
                    <S key={item.key} label={ITEM_LABELS[item.key] ?? item.key} value={formatted} variant="secondary" />
                ))}
            </StatGrid>
        </details>
    );
}

// ── 리소스별 전체 세부 정보 패널 ─────────────────────────────────────────
function StatsPanel({ resource, metrics, history, processes, systemInfo, uptime, sections, liveDisks, liveNetworks }) {
    const si  = systemInfo;
    const idx = resource.index ?? 0;
    const totalThreads = processes.reduce((s, p) => s + (Number(p.thread_count) || 0), 0);
    const totalHandles = processes.reduce((s, p) => s + (Number(p.handle_count) || 0), 0);

    switch (resource.type) {

        /* ── CPU ── */
        case 'cpu': return (
            <InfoSplit
                primary={(
                    <>
                        <S label="이용률" value={getVal(metrics, 1)} />
                        <S label="속도" value={getVal(metrics, 7)} />
                        <S label="프로세스" value={`${processes.length}`} />
                        {totalThreads > 0 && <S label="스레드" value={`${totalThreads}`} />}
                        {totalHandles > 0 && <S label="핸들" value={`${totalHandles}`} />}
                        <S label="작동 시간" value={uptime !== null ? fmtUptime(uptime) : (formatDuration(si?.cpu?.uptimeSeconds) ?? 'N/A')} />
                    </>
                )}
                secondary={(
                    <>
                        <StatGrid variant="secondary">
                            <S label="기본 속도" value={formatByUnit(si?.cpu?.baseSpeedMhz, 'mhz') ?? 'N/A'} variant="secondary" />
                            <S label="소켓" value={si?.cpu?.sockets ?? 'N/A'} variant="secondary" />
                            <S label="코어" value={si?.cpu?.cores ?? 'N/A'} variant="secondary" />
                            <S label="논리 프로세서" value={si?.cpu?.logicalProcessors ?? 'N/A'} variant="secondary" />
                            <S label="가상화" value={formatByUnit(si?.cpu?.virtualization) ?? 'N/A'} variant="secondary" />
                        </StatGrid>
                        <SystemSections sections={sections} resource={resource} />
                    </>
                )}
            />
        );

        /* ── 메모리 ── */
        case 'memory': {
            const slots = si?.memory?.slotsTotal
                ? `${si?.memory?.slotsUsed ?? 0} / ${si.memory.slotsTotal}`
                : si?.memory?.slotsUsed;
            return (
                <InfoSplit
                    primary={(
                        <>
                            <S label="전체" value={formatByUnit(si?.memory?.totalBytes, 'bytes') ?? 'N/A'} />
                            <S label="사용 중" value={getVal(metrics, 8)} />
                            <S label="사용 가능" value={getVal(metrics, 9)} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <SIf label="커밋됨" value={getVal(metrics, 11) !== 'N/A' ? (si?.memory?.commitLimitBytes ? `${getVal(metrics, 11)} / ${formatByUnit(si.memory.commitLimitBytes, 'bytes')}` : getVal(metrics, 11)) : null} variant="secondary" />
                                <SIf label="캐시됨" value={getVal(metrics, 10) !== 'N/A' ? getVal(metrics, 10) : null} variant="secondary" />
                                <SIf label="페이징 풀" value={formatByUnit(si?.memory?.pagedPoolBytes, 'bytes')} variant="secondary" />
                                <SIf label="비페이징 풀" value={formatByUnit(si?.memory?.nonPagedPoolBytes, 'bytes')} variant="secondary" />
                                <SIf label="하드웨어 예약" value={formatByUnit(si?.memory?.hardwareReservedBytes, 'bytes')} variant="secondary" />
                                <SIf label="속도" value={formatByUnit(si?.memory?.speedMtPerSecond, 'mtPerSecond') ?? si?.memory?.speedMhz} variant="secondary" />
                                <SIf label="사용된 슬롯" value={slots} variant="secondary" />
                                <SIf label="폼팩터" value={si?.memory?.formFactor} variant="secondary" />
                            </StatGrid>
                            <SystemSections sections={sections} resource={resource} />
                        </>
                    )}
                />
            );
        }

        /* ── 디스크 (배열 기반) ── */
        case 'disk': {
            const disk = mergeLiveDisk(si?.disks?.[idx], liveDisks, idx);
            const diskActiveTime = formatByUnit(disk?.activeTimePercent, 'percent')
                ?? formatByUnit(getResourcePercent(resource, metrics, history), 'percent')
                ?? (disk ? formatByUnit(resource.fallbackPercent, 'percent') : getVal(metrics, 4));
            return (
                <InfoSplit
                    primary={(
                        <>
                            <S label="활성 시간" value={diskActiveTime} />
                            <SIf label="읽기 속도" value={formatByUnit(disk?.readBytesPerSecond, 'bytesPerSecond') ?? getVal(metrics, 12)} />
                            <SIf label="쓰기 속도" value={formatByUnit(disk?.writeBytesPerSecond, 'bytesPerSecond') ?? getVal(metrics, 13)} />
                            <SIf label="평균 응답 시간" value={formatByUnit(disk?.averageResponseTimeMs, 'ms')} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <SIf label="용량" value={formatByUnit(disk?.totalBytes, 'bytes') ?? disk?.total} variant="secondary" />
                                <SIf label="사용됨" value={formatByUnit(disk?.usedBytes, 'bytes') ?? disk?.used} variant="secondary" />
                                <SIf label="여유 공간" value={formatByUnit(disk?.freeBytes, 'bytes') ?? disk?.free} variant="secondary" />
                                <SIf label="용량 사용률" value={formatByUnit(disk?.capacityUsagePercent ?? disk?.usagePercent, 'percent')} variant="secondary" />
                                <SIf label="큐 길이" value={formatByUnit(disk?.queueLength, 'count')} variant="secondary" />
                                <SIf label="파티션" value={formatPartitionList(disk?.partitions ?? disk?.mountpoint)} variant="secondary" />
                                <SIf label="파일시스템" value={disk?.fstype} variant="secondary" />
                                <SIf label="종류" value={disk?.type} variant="secondary" />
                            </StatGrid>
                            <SystemSections sections={sections} resource={resource} />
                        </>
                    )}
                />
            );
        }

        /* ── 네트워크 (배열 기반) ── */
        case 'network': {
            const net = mergeLiveNetwork(si?.networks?.[idx], liveNetworks, idx);
            const sent = formatByUnit(net?.sentBytesPerSecond, 'bytesPerSecond') ?? getNetworkResourceValues(resource, metrics, history).sent;
            const recv = formatByUnit(net?.receivedBytesPerSecond, 'bytesPerSecond') ?? getNetworkResourceValues(resource, metrics, history).recv;
            return (
                <InfoSplit
                    primary={(
                        <>
                            <S label="보내기" value={sent} />
                            <S label="받기" value={recv} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <SIf label="링크 속도" value={formatByUnit(net?.speedBitsPerSecond, 'bitsPerSecond')} variant="secondary" />
                                <SIf label="IPv4 주소" value={net?.ipv4} variant="secondary" />
                                <SIf label="IPv6 주소" value={net?.ipv6} variant="secondary" />
                                <SIf label="MAC 주소" value={net?.macAddress} variant="secondary" />
                                <SIf label="SSID" value={net?.ssid} variant="secondary" />
                                <SIf label="신호 강도" value={formatByUnit(net?.signalStrengthDbm, 'dbm') ?? net?.signalStrength} variant="secondary" />
                                <SIf label="어댑터 이름" value={net?.adapterName} variant="secondary" />
                                <SIf label="연결 형식" value={formatByUnit(net?.connectionType) ?? net?.connectionType} variant="secondary" />
                            </StatGrid>
                            <SystemSections sections={sections} resource={resource} />
                        </>
                    )}
                />
            );
        }

        /* ── GPU (배열 기반) ── */
        case 'gpu': {
            const gpu = si?.gpus?.[idx];
            const gpuMemory = formatPair(gpu?.gpuMemoryUsedBytes, gpu?.gpuMemoryTotalBytes, 'bytes')
                ?? formatByUnit(gpu?.usedMemoryBytes, 'bytes')
                ?? gpu?.usedMemory;
            const dedicatedMemory = formatPair(gpu?.dedicatedMemoryUsedBytes, gpu?.dedicatedMemoryTotalBytes, 'bytes')
                ?? formatByUnit(gpu?.dedicatedMemoryBytes, 'bytes')
                ?? gpu?.dedicatedMemory;
            const sharedMemory = formatPair(gpu?.sharedMemoryUsedBytes, gpu?.sharedMemoryTotalBytes, 'bytes')
                ?? formatByUnit(gpu?.sharedMemoryBytes, 'bytes')
                ?? gpu?.sharedMemory;
            const hardwareReservedMemory = formatByUnit(
                gpu?.hardwareReservedMemoryBytes ?? gpu?.dedicatedSystemMemoryBytes,
                'bytes',
            );
            const displayMemory = formatByUnit(gpu?.displayMemoryBytes, 'bytes');
            return (
                <InfoSplit
                    primary={(
                        <>
                            <S label="사용률" value={getVal(metrics, 2)} />
                            <S label="온도" value={formatByUnit(gpu?.temperatureCelsius, 'celsius')} />
                            <S label="GPU 메모리" value={gpuMemory} />
                            <S label="전용 GPU 메모리" value={dedicatedMemory} />
                            <S label="공유 GPU 메모리" value={sharedMemory} />
                            <S label="하드웨어 예약" value={hardwareReservedMemory} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <S label="표시 메모리" value={displayMemory} variant="secondary" />
                                <S label="드라이버 버전" value={gpu?.driverVersion} variant="secondary" />
                                <S label="드라이버 날짜" value={gpu?.driverDate} variant="secondary" />
                                <S label="DirectX 버전" value={gpu?.directXVersion} variant="secondary" />
                                <S label="DDI 버전" value={gpu?.ddiVersion} variant="secondary" />
                                <S label="드라이버 모델" value={gpu?.driverModel} variant="secondary" />
                            </StatGrid>
                            <SystemSections sections={sections} resource={resource} />
                        </>
                    )}
                />
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

    // 리소스 라벨 조각을 함수로 렌더링해 렌더 중 새 컴포넌트 생성 경고를 피합니다.
    const renderLabel = ({ size = '0.88rem', subSize = '0.72rem', gap = 4 } = {}) => (
        <span title={resource.sublabel ? `${resource.label} ${resource.sublabel}` : resource.label}
              style={{ display: 'flex', alignItems: 'baseline', minWidth: 0, gap }}>
            <span style={{ color: col, fontSize: size, fontWeight: 600, flexShrink: 0 }}>{resource.label}</span>
            {resource.sublabel && (
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: subSize, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {resource.sublabel}
                </span>
            )}
        </span>
    );
    // 작은 화면용 보조 라벨도 일반 렌더 함수로 처리합니다.
    const renderSubLabel = (size = '0.65rem') => resource.sublabel ? (
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
                <div className="mb-1">{renderLabel({ size: '0.88rem', subSize: '0.72rem', gap: 4 })}</div>
                <MiniGraph history={history} resource={resource} />
            </div>

            {/* lg~xl: 미니 그래프, 128px */}
            <div className="d-none d-lg-block d-xl-none"
                 style={{ minWidth: 128, maxWidth: 128, borderLeft: bl, padding: '8px 10px 6px' }}>
                <div className="mb-1">{renderLabel({ size: '0.82rem', subSize: '0.68rem', gap: 3 })}</div>
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
                    {getSidebarValue(resource, metrics, history)}
                </span>
            </div>

            {/* sm~md: 수평 탭, 라벨 + 수치 */}
            <div className="d-none d-sm-flex d-md-none flex-column align-items-center justify-content-center"
                 style={{ borderBottom: bb, padding: '8px 10px 6px', flexShrink: 0, minWidth: 64 }}>
                <span className="text-truncate w-100 text-center"
                      style={{ color: col, fontSize: '0.8rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
                {renderSubLabel('0.62rem')}
                <span style={{ color: isActive ? ac : 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                    {getSidebarValue(resource, metrics, history)}
                </span>
            </div>

            {/* xs~sm: 수평 탭, 라벨만 (가장 컴팩트) */}
            <div className="d-flex d-sm-none flex-column align-items-center justify-content-center"
                 style={{ borderBottom: bb, padding: '6px 6px 5px', flexShrink: 0, minWidth: 52 }}>
                <span className="text-truncate w-100 text-center"
                      style={{ color: col, fontSize: '0.74rem', fontWeight: 600 }}>
                    {resource.label}
                </span>
                {renderSubLabel('0.6rem')}
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
function TaskManager({ metrics, history, processes, systemInfo, liveDisks, liveNetworks }) {
    // systemInfo 기반으로 리소스 목록 동적 생성
    const resources = useMemo(() => buildResources(systemInfo), [systemInfo]);

    const [selected, setSelected] = useState('cpu');
    const [selectedCpuGraphMode, setSelectedCpuGraphMode] = useState('cpu');
    const [cpuGraphDropdownOpen, setCpuGraphDropdownOpen] = useState(false);
    // 선택된 키가 목록에 없으면 첫 항목으로 폴백
    const resource = resources.find(r => r.key === selected) ?? resources[0];
    const cpuLogicalCount = useMemo(() => {
        const fromMetric = getCpuLogicalValues(metrics).length;
        const fromSystem = Number(systemInfo?.cpu?.logicalProcessors);
        const latest = Array.isArray(history) ? history[history.length - 1] : null;
        const fromHistory = latest
            ? Object.keys(latest).filter(key => key.startsWith('cpu_logical_')).length
            : 0;
        return Math.max(fromMetric, fromHistory, Number.isFinite(fromSystem) ? fromSystem : 0);
    }, [history, metrics, systemInfo?.cpu?.logicalProcessors]);
    const cpuGraphOptions = useMemo(() => [
        { key: 'cpu', label: '전체 이용률', description: '하나로 보기' },
        ...(cpuLogicalCount > 0
            ? [{ key: 'logical-all', label: '논리 프로세서', description: `${cpuLogicalCount}개 개별 보기` }]
            : []),
    ], [cpuLogicalCount]);
    const effectiveCpuGraphMode = cpuGraphOptions.some(option => option.key === selectedCpuGraphMode)
        ? selectedCpuGraphMode
        : 'cpu';
    const cpuGraphOption = cpuGraphOptions.find(option => option.key === effectiveCpuGraphMode) ?? cpuGraphOptions[0];
    const cpuLogicalKeys = useMemo(
        () => Array.from({ length: cpuLogicalCount }, (_, index) => `cpu_logical_${index}`),
        [cpuLogicalCount]
    );
    const isCpuLogicalMode = resource.type === 'cpu' && cpuGraphOption.key === 'logical-all' && cpuLogicalKeys.length > 0;
    const cpuLogicalResources = useMemo(() => (
        cpuLogicalKeys.map((key, index) => ({
            ...resource,
            key: `${resource.key}_${key}`,
            dataKeys: [key],
            seriesLabels: [`논리 ${index + 1}`],
            color: CPU_LOGICAL_COLORS[index % CPU_LOGICAL_COLORS.length],
            color2: null,
            colors: null,
            yLabel: `논리 ${index + 1} % 사용률`,
        }))
    ), [cpuLogicalKeys, resource]);

    // 그래프는 기본 75% 폭으로 시작하고, 사용자가 가로/세로 크기를 조절할 수 있게 합니다.
    const [graphHeight, setGraphHeight] = useState(375);
    const [graphWidth, setGraphWidth]   = useState(null);
    const graphHeightRef     = useRef(375);
    const graphWidthRef      = useRef(null);
    const graphContainerRef  = useRef(null);
    useEffect(() => {
        if (graphWidth !== null || !graphContainerRef.current) return;
        const initWidth = Math.max(360, Math.floor(graphContainerRef.current.offsetWidth * 0.75));
        graphWidthRef.current = initWidth;
        setGraphWidth(initWidth);
    }, [graphWidth]);
    const createHeightDragHandler  = useCallback((e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = graphHeightRef.current;
        const onMove = (e) => {
            const h = Math.max(150, Math.min(900, startH + e.clientY - startY));
            graphHeightRef.current = h;
            setGraphHeight(h);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);
    const createWidthDragHandler = useCallback((e) => {
        e.preventDefault();
        if (!graphContainerRef.current) return;
        const startX = e.clientX;
        const maxW = graphContainerRef.current.offsetWidth;
        const startW = graphWidthRef.current ?? Math.floor(maxW * 0.75);
        const onMove = (e) => {
            const w = Math.max(300, Math.min(maxW, startW + e.clientX - startX));
            graphWidthRef.current = w;
            setGraphWidth(w);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);
    const createDiagonalDragHandler = useCallback((e) => {
        e.preventDefault();
        if (!graphContainerRef.current) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const maxW = graphContainerRef.current.offsetWidth;
        const startW = graphWidthRef.current ?? Math.floor(maxW * 0.75);
        const startH = graphHeightRef.current;
        const onMove = (e) => {
            const w = Math.max(300, Math.min(maxW, startW + e.clientX - startX));
            const h = Math.max(150, Math.min(900, startH + e.clientY - startY));
            graphWidthRef.current = w;
            graphHeightRef.current = h;
            setGraphWidth(w);
            setGraphHeight(h);
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
        const base = Number.isFinite(Number(systemInfo?.cpu?.uptimeSeconds))
            ? Number(systemInfo.cpu.uptimeSeconds)
            : parseUptime(systemInfo?.cpu?.uptime);
        if (base === null) return;
        uptimeBaseRef.current = base;
        const syncTimer = setTimeout(() => {
            // systemInfo의 기준 시간을 표시 상태에 반영한 뒤 1초마다 증가시킵니다.
            setUptime(base);
        }, 0);
        const timer = setInterval(() => {
            uptimeBaseRef.current += 1;
            setUptime(uptimeBaseRef.current);
        }, 1000);
        return () => {
            clearTimeout(syncTimer);
            clearInterval(timer);
        };
    }, [systemInfo?.cpu?.uptimeSeconds, systemInfo?.cpu?.uptime]);

    if (!metrics || metrics.length === 0) {
        return (
            <div className="d-flex flex-column align-items-center justify-content-center h-100"
                 style={{ color: 'rgba(255,255,255,0.4)' }}>
                <div className="spinner-border mb-3 text-info" role="status" />
                <span style={{ fontSize: '0.9rem' }}>데이터 수신 대기 중...</span>
            </div>
        );
    }

    const selectedDisk = resource.type === 'disk' ? systemInfo?.disks?.[resource.index ?? 0] : null;
    const titleSuffix = formatPartitionList(selectedDisk?.partitions ?? selectedDisk?.mountpoint, true);
    const renderTitle = (fontSize, suffixSize) => (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flexWrap: 'wrap', color: '#fff', fontSize, fontWeight: 700, lineHeight: 1.2 }}>
            <span>{resource.label}</span>
            {titleSuffix && (
                <span style={{ color: 'rgba(255,255,255,0.52)', fontSize: suffixSize, fontWeight: 500, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {titleSuffix}
                </span>
            )}
        </span>
    );

    // 헤더 서브타이틀: CPU 모델명, 디스크 제품명, GPU 모델명, 네트워크 어댑터명
    const getSubtitle = () => {
        const idx = resource.index ?? 0;
        switch (resource.type) {
            case 'cpu':     return systemInfo?.cpu?.model ?? null;
            case 'disk':    return systemInfo?.disks?.[idx]?.model || null;
            case 'gpu':     return systemInfo?.gpus?.[idx]?.model ?? null;
            case 'network': return systemInfo?.networks?.[idx]?.adapterName ?? null;
            default:        return null;
        }
    };
    const subtitle = getSubtitle();
    const headlineValue = getResourceHeadlineValue(resource, metrics, history);
    const renderHeadlineValue = (fontSize) => {
        if (!headlineValue) return null;
        if (resource.type !== 'network') {
            return (
                <span style={{ color: resource.color, fontSize, fontWeight: 700, lineHeight: 1 }}>
                    {headlineValue}
                </span>
            );
        }

        const networkValues = getNetworkResourceValues(resource, metrics, history);
        return (
            <span className="d-inline-flex align-items-center justify-content-end gap-2 flex-wrap"
                  style={{ fontSize, fontWeight: 700, lineHeight: 1.15 }}>
                <span style={{ color: resource.color }}>
                    송신 {networkValues.sent}
                </span>
                <span style={{ color: resource.color2 ?? '#4db6ac' }}>
                    수신 {networkValues.recv}
                </span>
            </span>
        );
    };
    const renderCpuGraphDropdown = (compact = false) => {
        if (resource.type !== 'cpu' || cpuGraphOptions.length <= 1) return null;
        return (
            <div
                className={`dropdown ${cpuGraphDropdownOpen ? 'show' : ''}`}
                onBlur={() => setTimeout(() => setCpuGraphDropdownOpen(false), 80)}
                style={{ position: 'relative', width: compact ? '100%' : 190, maxWidth: '100%' }}
            >
                <button
                    type="button"
                    className="btn btn-sm d-flex align-items-center justify-content-between gap-2 w-100"
                    aria-expanded={cpuGraphDropdownOpen}
                    aria-label="CPU 그래프 표시 방식"
                    onClick={() => setCpuGraphDropdownOpen(open => !open)}
                    style={{
                        height: compact ? 30 : 32,
                        padding: compact ? '3px 9px' : '4px 10px',
                        border: '1px solid rgba(79,195,247,0.35)',
                        background: 'rgba(79,195,247,0.1)',
                        color: '#dff6ff',
                        borderRadius: 6,
                        fontSize: compact ? '0.72rem' : '0.76rem',
                        fontWeight: 600,
                    }}
                >
                    <span className="text-truncate">{cpuGraphOption.label}</span>
                    <span style={{ color: 'rgba(223,246,255,0.65)', fontSize: '0.7rem' }}>▼</span>
                </button>
                <div
                    className={`dropdown-menu dropdown-menu-dark ${cpuGraphDropdownOpen ? 'show' : ''}`}
                    style={{
                        minWidth: '100%',
                        marginTop: 4,
                        padding: 4,
                        background: '#171b21',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 6,
                        boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
                    }}
                >
                    {cpuGraphOptions.map(option => (
                        <button
                            key={option.key}
                            type="button"
                            className={`dropdown-item rounded-1 ${option.key === effectiveCpuGraphMode ? 'active' : ''}`}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => {
                                setSelectedCpuGraphMode(option.key);
                                setCpuGraphDropdownOpen(false);
                            }}
                            style={{
                                fontSize: '0.74rem',
                                padding: '6px 8px',
                                background: option.key === effectiveCpuGraphMode ? 'rgba(79,195,247,0.22)' : 'transparent',
                                color: option.key === effectiveCpuGraphMode ? '#ffffff' : '#d6dbe1',
                            }}
                        >
                            <span className="d-block fw-semibold">{option.label}</span>
                            <span className="d-block" style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.66rem' }}>
                                {option.description}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

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
                                 metrics={metrics} history={history} onClick={() => {
                                     setSelected(r.key);
                                     setCpuGraphDropdownOpen(false);
                                 }} />
                ))}
            </div>

            {/* ── 오른쪽 상세 패널 ── */}
            <div className="flex-grow-1 px-2 px-sm-3" style={{ paddingTop: 10, paddingBottom: 10, minWidth: 0, width: '100%', overflowY: 'auto', overflowX: 'hidden' }}>

                {/* 메인 차트 + 리사이즈 핸들 (PC) */}
                <div className="d-none d-md-block mb-1 position-relative"
                     ref={graphContainerRef}
                     style={{ width: '100%', maxWidth: '100%' }}>
                    <div
                        className="position-relative"
                        style={{ width: isCpuLogicalMode ? '100%' : (graphWidth ? `${graphWidth}px` : '75%'), maxWidth: '100%' }}
                    >
                        {/* 헤더는 그래프 폭과 같은 컨테이너 안에 둬서 우측 값/버튼이 그래프 오른쪽 끝에 붙습니다. */}
                        <div className="d-flex justify-content-between align-items-baseline mb-2" style={{ width: '100%' }}>
                            {renderTitle('1.95rem', '1.05rem')}
                            <div className="d-flex align-items-baseline gap-2 flex-shrink-1"
                                 style={{ minWidth: 0, maxWidth: '70%', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 4 }}>
                                {renderCpuGraphDropdown()}
                                {subtitle && (
                                    <span className="d-none d-sm-inline"
                                          style={{
                                              // 긴 CPU/디스크/GPU 모델명은 말줄임 없이 우측 영역 안에서 줄바꿈합니다.
                                              color: 'rgba(255,255,255,0.5)',
                                              fontSize: '1.1rem',
                                              lineHeight: 1.2,
                                              maxWidth: '100%',
                                              textAlign: 'right',
                                              whiteSpace: 'normal',
                                              overflowWrap: 'anywhere',
                                              wordBreak: 'break-word',
                                          }}>
                                        {subtitle}
                                    </span>
                                )}
                                {renderHeadlineValue(resource.type === 'network' ? '1rem' : '1.3rem')}
                            </div>
                        </div>
                        {isCpuLogicalMode ? (
                            <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} />
                        ) : (
                            <>
                                <MainGraph history={history} resource={resource} pcHeight={graphHeight} />
                                {/* 우측 핸들 (가로) */}
                                <div className="position-absolute d-flex align-items-center justify-content-center"
                                     onMouseDown={createWidthDragHandler}
                                     style={{ top: 0, right: -10, width: 12, bottom: 12, cursor: 'ew-resize' }}>
                                    <div style={{ width: 3, height: 48, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                                </div>
                                {/* 우하단 핸들 (대각) */}
                                <div className="position-absolute"
                                     onMouseDown={createDiagonalDragHandler}
                                     style={{ right: -10, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize',
                                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: 8, height: 8, borderRight: '2px solid rgba(255,255,255,0.3)',
                                                  borderBottom: '2px solid rgba(255,255,255,0.3)', borderRadius: '0 0 2px 0' }} />
                                </div>
                            </>
                        )}
                    </div>
                    {/* 하단 핸들 (세로) */}
                    {!isCpuLogicalMode && (
                        <div className="d-flex align-items-center justify-content-center"
                             onMouseDown={createHeightDragHandler}
                             style={{ height: 12, cursor: 'ns-resize', marginTop: 2, width: graphWidth ? `${graphWidth}px` : '75%', maxWidth: '100%' }}>
                            <div style={{ width: 48, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                        </div>
                    )}
                </div>
                {/* xs: 매우 작은 화면 */}
                <div className="d-block d-sm-none mb-2">
                    <div className="mb-1">
                        <div className="d-flex justify-content-between align-items-center gap-2">
                            {renderTitle('1.05rem', '0.72rem')}
                        </div>
                        {headlineValue && (
                            <div className="text-truncate" style={{ maxWidth: '100%', marginTop: 2 }}>
                                {renderHeadlineValue('0.82rem')}
                            </div>
                        )}
                        {resource.type === 'cpu' && cpuGraphOptions.length > 1 && (
                            <div className="mt-2">{renderCpuGraphDropdown(true)}</div>
                        )}
                    </div>
                    {isCpuLogicalMode ? (
                        <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} />
                    ) : (
                        <MainGraph history={history} resource={resource} mobileHeight={140} />
                    )}
                </div>

                {/* sm~md */}
                <div className="d-none d-sm-block d-md-none mb-3">
                    <div className="mb-2">
                        <div className="d-flex justify-content-between align-items-center gap-2">
                            {renderTitle('1.25rem', '0.82rem')}
                        </div>
                        {headlineValue && (
                            <div className="text-truncate" style={{ maxWidth: '100%', marginTop: 2 }}>
                                {renderHeadlineValue('0.95rem')}
                            </div>
                        )}
                        {resource.type === 'cpu' && cpuGraphOptions.length > 1 && (
                            <div className="mt-2" style={{ maxWidth: 220 }}>{renderCpuGraphDropdown(true)}</div>
                        )}
                    </div>
                    {isCpuLogicalMode ? (
                        <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} />
                    ) : (
                        <MainGraph history={history} resource={resource} mobileHeight={180} />
                    )}
                </div>

                {/* 세부 통계 */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                    {!systemInfo ? (
                        <div className="d-flex align-items-center gap-2" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>
                            <div className="spinner-border spinner-border-sm" role="status" style={{ width: '0.8rem', height: '0.8rem' }} />
                            하드웨어 정보 수집 중...
                        </div>
                    ) : (
                        <>
                            <StatsPanel resource={resource} metrics={metrics} history={history} processes={processes} systemInfo={systemInfo} uptime={uptime} sections={systemInfo?.sections} liveDisks={liveDisks} liveNetworks={liveNetworks} />
                            <SystemInfoSection sections={systemInfo?.sections} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default TaskManager;
