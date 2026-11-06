import { formatBytes } from '../../utils/format.js';

export function formatPartitionList(value, wrap = false) {
    if (!value) return null;
    const parts = String(value)
        .split(/\s*,\s*/)
        .map(part => part.trim())
        .filter(Boolean);
    const text = parts.length > 0 ? parts.join(' · ') : null;
    return text && wrap ? `(${text})` : text;
}

export const ITEM_LABELS = {
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

export const TEXT_VALUE_LABELS = {
    available: '사용 가능',
    unavailable: '사용 불가',
    wifi: 'Wi-Fi',
    ethernet: '이더넷',
};

export const formatDuration = (seconds) => {
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

export const formatByUnit = (value, unit) => {
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

export const formatSectionValue = (item) => formatByUnit(item?.value, item?.unit);

export const formatMetricValue = (metric) => {
    const value = metric?.rawValue ?? metric?.value;
    return formatByUnit(value, metric?.unit) ?? 'N/A';
};

export const formatNetworkChartValue = (kilobytesPerSecond) => {
    const value = Number(kilobytesPerSecond);
    return Number.isFinite(value) ? formatByUnit(value * 1024, 'bytesPerSecond') ?? '0 B/s' : '0 B/s';
};

export const formatChartValue = (value, resource) =>
    resource.type === 'network'
        ? formatNetworkChartValue(value)
        : `${Number(value).toFixed(1)}${resource.unit}`;

export const formatPair = (current, total, unit) => {
    const currentText = formatByUnit(current, unit);
    const totalText = formatByUnit(total, unit);
    if (currentText && totalText) return `${currentText} / ${totalText}`;
    return currentText ?? totalText;
};

// "HH:MM:SS" 문자열 → 초
export const parseUptime = (str) => {
    if (!str) return null;
    const parts = str.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

// 초 → "HH:MM:SS"
export const fmtUptime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
