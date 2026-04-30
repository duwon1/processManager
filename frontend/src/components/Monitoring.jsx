import React from 'react';

const METRIC_LABELS = {
    'cpu.usagePercent': 'CPU 사용률',
    'gpu.usagePercent': 'GPU 사용률',
    'memory.usagePercent': '메모리 사용률',
    'disk.usagePercent': '디스크 사용률',
    'network.uploadBytesPerSecond': '업로드 속도',
    'network.downloadBytesPerSecond': '다운로드 속도',
    'memory.hardware': '메모리 구성',
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

const formatMetricValue = (metric) => {
    const value = metric?.rawValue ?? metric?.value;
    if (value === null || value === undefined || value === 'N/A') return 'N/A';

    switch (metric?.unit) {
        case 'percent': {
            const n = Number(value);
            return Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 1)}%` : String(value);
        }
        case 'bytes':
            return formatBytes(value) ?? 'N/A';
        case 'bytesPerSecond': {
            const formatted = formatBytes(value);
            return formatted ? `${formatted}/s` : 'N/A';
        }
        default:
            return typeof value === 'object' ? '수집됨' : String(value);
    }
};

const formatMemoryHardware = (metric) => {
    const value = metric?.rawValue ?? metric?.value;
    if (!value || typeof value !== 'object') {
        return value && value !== 'N/A' ? String(value) : null;
    }
    const parts = [];
    if (value.slotsUsed) parts.push(`${value.slotsUsed}슬롯`);
    if (value.perSlotBytes) parts.push(`${formatBytes(value.perSlotBytes)}`);
    if (value.memoryType) parts.push(value.memoryType);
    if (value.speedMtPerSecond) parts.push(`${value.speedMtPerSecond} MT/s`);
    if (value.totalBytes) parts.push(`총 ${formatBytes(value.totalBytes)}`);
    return parts.length > 0 ? parts.join(' · ') : null;
};

// props로 metrics를 받아오도록 수정했습니다.
function Monitoring({ metrics }) {

    // 부모로부터 데이터가 아직 오지 않았을 때 보여줄 화면
    if (!metrics || metrics.length === 0) {
        return <div className="text-white text-center py-5">데이터 수신 대기 중...</div>;
    }

    // 메모리 하드웨어 구성 정보 (id: 14)
    const memHardware = metrics.find(d => d.id === 14);

    return (
        <>
            {/* ── PC (md 이상): md 3열 → lg 6열, 원래 카드 크기 ── */}
            <div className="d-none d-md-block">
                <div className="row row-cols-md-3 row-cols-lg-6 g-3">
                    {metrics.filter(d => d.id <= 6).map((data, index) => (
                        <div className="col" key={data.id != null ? data.id : index}>
                            <div className="card shadow-sm h-100 bg-dark text-white border-secondary border-opacity-50">
                                <div className="card-body">
                                    {/* 지표 제목 (예: CPU 사용률) */}
                                    <h5 className="card-title text-info fs-6">{METRIC_LABELS[data.key] ?? data.title}</h5>
                                    {/* 지표 값 (예: 11.9%) */}
                                    <p className="card-text fs-4 fw-bold">{formatMetricValue(data)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── 모바일 (md 미만): 2열, 컴팩트 카드 ── */}
            <div className="d-block d-md-none">
                <div className="row row-cols-2 g-2">
                    {metrics.filter(d => d.id <= 6).map((data, index) => (
                        <div className="col" key={data.id != null ? data.id : index}>
                            <div className="card shadow-sm h-100 bg-dark text-white border-secondary border-opacity-50">
                                <div className="card-body py-2 px-3">
                                    {/* 지표 제목 (예: CPU 사용률) */}
                                    <h6 className="card-title text-info mb-1" style={{ fontSize: '0.75rem' }}>{METRIC_LABELS[data.key] ?? data.title}</h6>
                                    {/* 지표 값 (예: 11.9%) */}
                                    <p className="card-text fs-5 fw-bold mb-0">{formatMetricValue(data)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── 메모리 하드웨어 구성 정보 (슬롯, 타입, 속도) ── */}
            {formatMemoryHardware(memHardware) && (
                <div className="mt-2 px-2">
                    <small className="text-secondary">
                        <span className="text-info me-1">{METRIC_LABELS[memHardware.key] ?? memHardware.title}:</span>
                        {formatMemoryHardware(memHardware)}
                    </small>
                </div>
            )}
        </>
    );
}

export default Monitoring;
