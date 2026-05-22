import React, { useMemo, useState } from 'react';

const FIELD_LABELS = {
    name: '장치명',
    manufacturer: '제조사',
    status: '상태',
    driverProvider: '드라이버 공급자',
    driverVersion: '드라이버 버전',
    driverDate: '드라이버 날짜',
    driverInf: 'INF',
    driverSigner: '서명자',
    deviceId: '장치 ID',
    pnpDeviceId: 'PNP ID',
    problemCode: '오류 코드',
    socket: '소켓',
    cores: '코어',
    logicalProcessors: '논리 프로세서',
    maxClockMhz: '최대 클럭',
    currentClockMhz: '현재 클럭',
    product: '제품명',
    version: '버전',
    serialNumber: '시리얼',
    computerManufacturer: 'PC 제조사',
    computerModel: 'PC 모델',
    biosVersion: 'BIOS 버전',
    biosName: 'BIOS 이름',
    videoProcessor: '비디오 프로세서',
    adapterRamBytes: '어댑터 메모리',
    videoMode: '비디오 모드',
    connectionName: '연결 이름',
    description: '설명',
    adapterType: '어댑터 종류',
    macAddress: 'MAC',
    speedBitsPerSecond: '속도',
    physicalAdapter: '물리 어댑터',
    netEnabled: '활성화',
    serviceName: '서비스',
};

const CORE_FIELDS = [
    'manufacturer',
    'status',
    'driverProvider',
    'driverVersion',
    'driverDate',
    'problemCode',
];

const CORE_CATEGORIES = [
    { key: 'cpu', title: 'CPU', icon: 'bi-cpu', itemsKey: 'cpu', fields: ['manufacturer', 'socket', 'cores', 'logicalProcessors', 'maxClockMhz', 'currentClockMhz', 'status', 'driverVersion'] },
    { key: 'baseboard', title: '메인보드', icon: 'bi-motherboard', itemsKey: 'baseboard', fields: ['manufacturer', 'product', 'version', 'serialNumber', 'computerManufacturer', 'computerModel', 'biosVersion'] },
    { key: 'gpu', title: '그래픽카드', icon: 'bi-gpu-card', itemsKey: 'gpus', fields: ['manufacturer', 'videoProcessor', 'adapterRamBytes', 'driverProvider', 'driverVersion', 'driverDate', 'status'] },
    { key: 'network', title: '랜카드', icon: 'bi-ethernet', itemsKey: 'networkAdapters', fields: ['connectionName', 'description', 'manufacturer', 'adapterType', 'macAddress', 'speedBitsPerSecond', 'physicalAdapter', 'netEnabled', 'driverVersion'] },
];

const EMPTY_ARRAY = [];

const formatBytes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let next = n;
    let unitIndex = 0;
    while (next >= 1024 && unitIndex < units.length - 1) {
        next /= 1024;
        unitIndex += 1;
    }
    return `${next.toFixed(next >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatBits = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Gbps`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)} Mbps`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)} Kbps`;
    return `${n} bps`;
};

const formatValue = (key, value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value ? '예' : '아니오';
    if (key.toLowerCase().includes('bytes') || key === 'adapterRamBytes') return formatBytes(value);
    if (key === 'speedBitsPerSecond') return formatBits(value);
    if (key.toLowerCase().includes('clockmhz')) return `${value} MHz`;
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
};

const compactDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
};

const searchable = (device) => [
    device.name,
    device.manufacturer,
    device.categoryLabel,
    device.status,
    device.driverProvider,
    device.driverVersion,
    device.deviceId,
    device.pnpDeviceId,
].filter(Boolean).join(' ').toLowerCase();

function DetailGrid({ item, fields }) {
    const entries = fields
        .map(key => [key, formatValue(key, item?.[key])])
        .filter(([, value]) => value);

    if (entries.length === 0) {
        return <span className="device-manager-muted">표시할 세부 정보 없음</span>;
    }

    return (
        <dl className="device-manager-detail-grid">
            {entries.map(([key, value]) => (
                <React.Fragment key={key}>
                    <dt>{FIELD_LABELS[key] ?? key}</dt>
                    <dd>{value}</dd>
                </React.Fragment>
            ))}
        </dl>
    );
}

function CoreHardwareSection({ info }) {
    return (
        <section className="device-manager-core">
            {CORE_CATEGORIES.map(category => {
                const raw = info?.[category.itemsKey];
                const items = Array.isArray(raw) ? raw : (raw && Object.keys(raw).length > 0 ? [raw] : []);
                return (
                    <div key={category.key} className="device-manager-core-group">
                        <div className="device-manager-core-heading">
                            <i className={`bi ${category.icon}`} aria-hidden="true"></i>
                            <span>{category.title}</span>
                            <strong>{items.length}</strong>
                        </div>
                        {items.length === 0 ? (
                            <p className="device-manager-empty-line">정보 없음</p>
                        ) : (
                            <div className="device-manager-core-list">
                                {items.map((item, index) => (
                                    <article key={`${category.key}-${index}`} className="device-manager-core-item">
                                        <h4>{item.name || item.product || item.computerModel || `${category.title} ${index + 1}`}</h4>
                                        <DetailGrid item={item} fields={category.fields} />
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}

function DeviceRow({ device }) {
    const details = CORE_FIELDS
        .map(key => [key, formatValue(key, device?.[key])])
        .filter(([, value]) => value);

    return (
        <article className={`device-manager-row ${device.hasProblem ? 'device-manager-row-problem' : ''}`}>
            <div className="device-manager-row-main">
                <span className="device-manager-row-category">{device.categoryLabel || device.category || '기타 장치'}</span>
                <h4>{device.name || '이름 없는 장치'}</h4>
                <p>{device.pnpDeviceId || device.deviceId || '장치 ID 없음'}</p>
            </div>
            <div className="device-manager-row-meta">
                {details.map(([key, value]) => (
                    <span key={key}>
                        <em>{FIELD_LABELS[key] ?? key}</em>
                        {value}
                    </span>
                ))}
            </div>
        </article>
    );
}

function DeviceManager({ deviceInfo, isConnected, isLoading, onRefresh }) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [search, setSearch] = useState('');

    const categories = Array.isArray(deviceInfo?.categories) ? deviceInfo.categories : EMPTY_ARRAY;
    const allDevices = Array.isArray(deviceInfo?.devices) ? deviceInfo.devices : EMPTY_ARRAY;
    const selectedDevices = useMemo(() => {
        const source = selectedCategory === 'all'
            ? allDevices
            : categories.find(category => category.key === selectedCategory)?.devices ?? [];
        const query = search.trim().toLowerCase();
        if (!query) return source;
        return source.filter(device => searchable(device).includes(query));
    }, [allDevices, categories, search, selectedCategory]);

    const summary = deviceInfo?.summary ?? {};
    const unsupported = deviceInfo && deviceInfo.supported === false;

    return (
        <div className="device-manager-shell">
            <header className="device-manager-header">
                <div>
                    <p className="device-manager-eyebrow">Windows Device Inventory</p>
                    <h2>장치 관리자</h2>
                    <span>{deviceInfo?.nodeName || '선택한 노드'} · {deviceInfo?.osType || 'Windows 전용'}</span>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={onRefresh} disabled={!isConnected || isLoading}>
                    <i className={`bi ${isLoading ? 'bi-arrow-clockwise' : 'bi-arrow-repeat'} me-1`}></i>
                    {isLoading ? '조회 중' : '새로고침'}
                </button>
            </header>

            {!deviceInfo ? (
                <div className="device-manager-state">
                    <div className="spinner-border text-info mb-3" role="status"></div>
                    <h5>{isConnected ? '장치 정보를 요청하는 중입니다.' : '노드 연결을 기다리는 중입니다.'}</h5>
                </div>
            ) : unsupported ? (
                <div className="device-manager-state">
                    <i className="bi bi-windows text-secondary mb-3" aria-hidden="true"></i>
                    <h5>Windows 노드에서만 장치 관리자 정보를 조회합니다.</h5>
                    <p>{deviceInfo.message}</p>
                </div>
            ) : (
                <>
                    <section className="device-manager-summary" aria-label="장치 요약">
                        <span><strong>{summary.totalDevices ?? allDevices.length}</strong>전체 장치</span>
                        <span><strong>{summary.categoryCount ?? categories.length}</strong>카테고리</span>
                        <span><strong>{summary.problemDevices ?? 0}</strong>오류 장치</span>
                        <span><strong>{summary.gpuCount ?? 0}</strong>GPU</span>
                        <span><strong>{summary.networkAdapterCount ?? 0}</strong>네트워크</span>
                        {deviceInfo.collectedAt && <span><strong>{compactDate(deviceInfo.collectedAt)}</strong>수집 시각</span>}
                    </section>

                    <CoreHardwareSection info={deviceInfo} />

                    <section className="device-manager-browser">
                        <aside className="device-manager-category-list" aria-label="장치 카테고리">
                            <button
                                type="button"
                                className={selectedCategory === 'all' ? 'device-manager-category-active' : ''}
                                onClick={() => setSelectedCategory('all')}
                            >
                                <span>전체 장치</span>
                                <strong>{allDevices.length}</strong>
                            </button>
                            {categories.map(category => (
                                <button
                                    type="button"
                                    key={category.key}
                                    className={selectedCategory === category.key ? 'device-manager-category-active' : ''}
                                    onClick={() => setSelectedCategory(category.key)}
                                >
                                    <span>{category.label}</span>
                                    <strong>{category.count}</strong>
                                </button>
                            ))}
                        </aside>

                        <div className="device-manager-device-pane">
                            <div className="device-manager-toolbar">
                                <div>
                                    <strong>{selectedDevices.length}개 장치</strong>
                                    <span>{selectedCategory === 'all' ? '전체 카테고리' : categories.find(category => category.key === selectedCategory)?.label}</span>
                                </div>
                                <input
                                    type="search"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="장치명, 제조사, 드라이버 검색"
                                    aria-label="장치 검색"
                                />
                            </div>
                            <div className="device-manager-device-list">
                                {selectedDevices.length === 0 ? (
                                    <p className="device-manager-empty-line">조건에 맞는 장치가 없습니다.</p>
                                ) : (
                                    selectedDevices.map((device, index) => (
                                        <DeviceRow key={`${device.pnpDeviceId || device.deviceId || device.name}-${index}`} device={device} />
                                    ))
                                )}
                            </div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

export default DeviceManager;
