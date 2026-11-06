import { formatMetricValue, formatNetworkChartValue, formatPartitionList } from './format.js';

export const CPU_LOGICAL_COLORS = [
    'var(--pm-cpu)',
    'var(--pm-memory)',
    'var(--pm-disk)',
    'var(--pm-gpu)',
    'var(--pm-network-in)',
    'var(--pm-network-out)',
    '#5aa2ff',
    '#40d9aa',
    '#ffc266',
    '#b3a7ff',
    '#4dd4ef',
    '#ff9f7d',
];
export const RESOURCE_TYPE_ICONS = {
    cpu: 'bi-cpu',
    memory: 'bi-memory',
    disk: 'bi-hdd',
    network: 'bi-ethernet',
    gpu: 'bi-gpu-card',
};

export const sameDisk = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        (left.device && right.device && left.device === right.device) ||
        (left.partitions && right.partitions && left.partitions === right.partitions) ||
        (left.mountpoint && right.mountpoint && left.mountpoint === right.mountpoint)
    );
};

export const mergeLiveDisk = (disk, liveDisks, index) => {
    const liveDisk = Array.isArray(liveDisks)
        ? liveDisks.find(candidate => sameDisk(candidate, disk)) ?? liveDisks[index]
        : null;
    return liveDisk ? { ...(disk ?? {}), ...liveDisk } : disk;
};

export const sameNetwork = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        left.adapterName &&
        right.adapterName &&
        String(left.adapterName).toLowerCase() === String(right.adapterName).toLowerCase()
    );
};

export const mergeLiveNetwork = (network, liveNetworks, index) => {
    const liveNetwork = Array.isArray(liveNetworks)
        ? liveNetworks.find(candidate => sameNetwork(candidate, network)) ?? liveNetworks[index]
        : null;
    return liveNetwork ? { ...(network ?? {}), ...liveNetwork } : network;
};

// ── 리소스 동적 생성 ──────────────────────────────────────────────────────
// systemInfo가 없으면 각 카테고리당 1개 기본 항목으로 구성합니다.
export function buildResources(si) {
    const base = [
        {
            key: 'cpu', type: 'cpu', label: 'CPU', index: null,
            dataKeys: ['cpu'], seriesLabels: ['CPU'],
            color: 'var(--pm-cpu)', color2: null, unit: '%', metricIds: [1],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률',
        },
        {
            key: 'memory', type: 'memory', label: '메모리', index: null,
            dataKeys: ['memory'], seriesLabels: ['메모리'],
            color: 'var(--pm-memory)', color2: null, unit: '%', metricIds: [3],
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
            color: 'var(--pm-disk)', color2: null, unit: '%', metricIds: [4],
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
            color: 'var(--pm-network-out)', color2: 'var(--pm-network-in)', unit: ' KB/s', metricIds: [5, 6],
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
            color: 'var(--pm-gpu)', color2: null, unit: '%', metricIds: [2],
            max: 100, yTicks: [0,25,50,75,100], yLabel: '% 사용률',
        });
    });

    return base;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
export const getMetric = (metrics, id) => Array.isArray(metrics) ? metrics.find(m => m.id === id) : null;
export const getMetricRaw = (metrics, id) => {
    const metric = getMetric(metrics, id);
    return metric?.rawValue ?? metric?.value ?? null;
};

export const getCpuLogicalValues = (metrics) => {
    const value = getMetricRaw(metrics, 17);
    return Array.isArray(value)
        ? value.map(item => Number(item)).filter(item => Number.isFinite(item))
        : [];
};

export const getVal = (metrics, id) => formatMetricValue(getMetric(metrics, id));
export const getPct = (metrics, id) => {
    const value = getMetricRaw(metrics, id);
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const fallback = parseFloat(value);
    return Number.isFinite(fallback) ? fallback : 0;
};

export const getResourcePct = (resource, metrics) =>
    Number.isFinite(Number(resource?.fallbackPercent))
        ? Number(resource.fallbackPercent)
        : getPct(metrics, resource.metricIds[0]);

export const getLatestHistoryValue = (history, key) => {
    const latest = Array.isArray(history) ? history[history.length - 1] : null;
    const value = Number(latest?.[key]);
    return Number.isFinite(value) ? value : null;
};

export const getCpuLogicalPercent = (key, metrics, history) => {
    const fromHistory = getLatestHistoryValue(history, key);
    if (fromHistory !== null) return fromHistory;

    const match = /^cpu_logical_(\d+)$/.exec(key);
    if (!match) return null;

    const value = getCpuLogicalValues(metrics)[Number(match[1])];
    return Number.isFinite(value) ? value : null;
};

export const getResourcePercent = (resource, metrics, history) => {
    if (resource.type === 'disk') {
        const dataKey = resource.dataKeys?.[0];
        const fromHistory = dataKey ? getLatestHistoryValue(history, dataKey) : null;
        if (fromHistory !== null) return fromHistory;
        if (Number.isFinite(Number(resource?.fallbackPercent))) return Number(resource.fallbackPercent);
        return dataKey === 'disk' ? getPct(metrics, resource.metricIds[0]) : 0;
    }
    return getResourcePct(resource, metrics);
};

export const getNetworkResourceValues = (resource, metrics, history) => {
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

export const getResourceHeadlineValue = (resource, metrics, history) => {
    if (resource.type === 'network') {
        const values = getNetworkResourceValues(resource, metrics, history);
        return `↑ ${values.sent}  ↓ ${values.recv}`;
    }
    return `${getResourcePercent(resource, metrics, history).toFixed(1)}${resource.unit}`;
};

export const getSidebarValue = (r, metrics, history) =>
    r.type === 'network'
        ? `↑ ${getNetworkResourceValues(r, metrics, history).sent}`
        : `${getResourcePercent(r, metrics, history).toFixed(0)}${r.unit}`;
