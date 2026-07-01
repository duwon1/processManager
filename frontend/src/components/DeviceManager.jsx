import React, { useEffect, useMemo, useState } from 'react';

const FIELD_LABELS = {
    name: '장치명',
    category: '장치 종류',
    categoryLabel: '장치 종류',
    manufacturer: '제조사',
    status: '상태',
    service: '서비스',
    present: '현재 연결',
    driverProvider: '드라이버 공급자',
    driverVersion: '드라이버 버전',
    driverDate: '드라이버 날짜',
    driverInf: 'INF',
    driverSigner: '서명자',
    deviceId: '장치 ID',
    pnpDeviceId: 'PNP ID',
    classGuid: '클래스 GUID',
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
    systemType: '시스템 종류',
    biosManufacturer: 'BIOS 제조사',
    biosVersion: 'BIOS 버전',
    biosName: 'BIOS 이름',
    biosSerialNumber: 'BIOS 시리얼',
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
    busAddress: '버스 주소',
    bus: '버스',
    className: '장치 클래스',
    kernelModules: '커널 모듈',
    vendorId: '벤더 ID',
    productId: '제품 ID',
    subsystem: '서브시스템',
    sizeBytes: '용량',
    transport: '연결 방식',
    removable: '이동식',
    diskType: '디스크 종류',
    partitions: '파티션',
    mountpoints: '마운트',
    filesystem: '파일 시스템',
    filesystemLabel: '볼륨 라벨',
    ipv4: 'IPv4',
    ipv6: 'IPv6',
    capacityPercent: '배터리',
    devtype: '장치 타입',
    devname: '장치 노드',
    sysPath: '시스템 경로',
    modalias: '모듈 별칭',
    idPath: '장치 경로',
    symlinks: '심볼릭 링크',
};

const PROPERTY_TABS = [
    {
        key: 'general',
        label: '일반',
        fields: ['name', 'categoryLabel', 'manufacturer', 'status', 'problemCode', 'present', 'description'],
    },
    {
        key: 'driver',
        label: '드라이버',
        fields: ['driverProvider', 'driverVersion', 'driverDate', 'driverInf', 'driverSigner', 'service', 'serviceName'],
    },
    {
        key: 'details',
        label: '자세히',
        fields: [
            'deviceId',
            'pnpDeviceId',
            'classGuid',
            'socket',
            'cores',
            'logicalProcessors',
            'maxClockMhz',
            'currentClockMhz',
            'product',
            'version',
            'serialNumber',
            'computerManufacturer',
            'computerModel',
            'systemType',
            'biosManufacturer',
            'biosVersion',
            'biosName',
            'biosSerialNumber',
            'videoProcessor',
            'adapterRamBytes',
            'videoMode',
            'connectionName',
            'adapterType',
            'macAddress',
            'speedBitsPerSecond',
            'physicalAdapter',
            'netEnabled',
        ],
    },
];

const PROPERTY_FIELD_ORDER = [...new Set(PROPERTY_TABS.flatMap(tab => tab.fields))];
const INTERNAL_FIELDS = new Set(['hasProblem', 'devices', '_treeKey']);
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
    if (typeof value === 'string' && value.trim().toUpperCase() === 'N/A') return 'N/A';
    if (typeof value === 'boolean') return value ? '예' : '아니오';
    if (key.toLowerCase().includes('bytes') || key === 'adapterRamBytes') return formatBytes(value);
    if (key === 'speedBitsPerSecond') return formatBits(value);
    if (key === 'capacityPercent') return `${value}%`;
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

const CATEGORY_ICON_BY_KEY = {
    AudioEndpoint: 'bi-volume-up',
    Battery: 'bi-battery-half',
    Biometric: 'bi-fingerprint',
    Bluetooth: 'bi-bluetooth',
    Camera: 'bi-camera-video',
    CDROM: 'bi-disc',
    Computer: 'bi-pc-display',
    DiskDrive: 'bi-device-hdd',
    Display: 'bi-gpu-card',
    Extension: 'bi-box',
    Firmware: 'bi-memory',
    HDC: 'bi-nvme',
    HIDClass: 'bi-usb-symbol',
    Image: 'bi-webcam',
    Keyboard: 'bi-keyboard',
    Media: 'bi-volume-up',
    MEDIA: 'bi-volume-up',
    Modem: 'bi-modem',
    Monitor: 'bi-display',
    Mouse: 'bi-mouse',
    Net: 'bi-ethernet',
    Ports: 'bi-plug',
    PrintQueue: 'bi-printer',
    Printer: 'bi-printer',
    Processor: 'bi-cpu',
    SCSIAdapter: 'bi-pci-card',
    SecurityDevices: 'bi-shield-check',
    Sensor: 'bi-broadcast',
    SmartCardReader: 'bi-sim',
    SoftwareComponent: 'bi-card-list',
    SoftwareDevice: 'bi-card-list',
    System: 'bi-gear-wide-connected',
    USB: 'bi-usb-symbol',
    USBDevice: 'bi-usb-drive',
    Volume: 'bi-device-hdd',
    WPD: 'bi-phone',
    baseboard: 'bi-motherboard',
};

const CATEGORY_ICON_BY_LABEL = {
    '오디오 입력 및 출력': 'bi-volume-up',
    '배터리': 'bi-battery-half',
    '생체 인식 장치': 'bi-fingerprint',
    'Bluetooth': 'bi-bluetooth',
    '카메라': 'bi-camera-video',
    'DVD/CD-ROM 드라이브': 'bi-disc',
    '컴퓨터': 'bi-pc-display',
    '디스크 드라이브': 'bi-device-hdd',
    '디스플레이 어댑터': 'bi-gpu-card',
    '확장': 'bi-box',
    '펌웨어': 'bi-memory',
    'IDE ATA/ATAPI 컨트롤러': 'bi-nvme',
    '휴먼 인터페이스 장치': 'bi-usb-symbol',
    '이미징 장치': 'bi-webcam',
    '키보드': 'bi-keyboard',
    '사운드, 비디오 및 게임 컨트롤러': 'bi-volume-up',
    '모뎀': 'bi-modem',
    '모니터': 'bi-display',
    '마우스 및 기타 포인팅 장치': 'bi-mouse',
    '네트워크 어댑터': 'bi-ethernet',
    '포트(COM & LPT)': 'bi-plug',
    '인쇄 큐': 'bi-printer',
    '프린터': 'bi-printer',
    '프로세서': 'bi-cpu',
    '저장소 컨트롤러': 'bi-pci-card',
    '보안 장치': 'bi-shield-check',
    '센서': 'bi-broadcast',
    '스마트 카드 판독기': 'bi-sim',
    '소프트웨어 구성 요소': 'bi-card-list',
    '소프트웨어 장치': 'bi-card-list',
    '시스템 장치': 'bi-gear-wide-connected',
    '범용 직렬 버스 컨트롤러': 'bi-usb-symbol',
    '범용 직렬 버스 장치': 'bi-usb-drive',
    '저장소 볼륨': 'bi-device-hdd',
    '휴대용 장치': 'bi-phone',
    '메인보드': 'bi-motherboard',
};

const getCategoryIcon = (category) => {
    const key = String(category?.key || '').trim();
    const label = String(category?.label || '').trim();
    return CATEGORY_ICON_BY_KEY[key] || CATEGORY_ICON_BY_LABEL[label] || 'bi-hdd-network';
};

const deviceKey = (device, index = 0) => (
    device?._treeKey
    || device?.pnpDeviceId
    || device?.deviceId
    || `${device?.categoryLabel || 'device'}-${device?.name || index}`
);

const propertyEntries = (device, fields) => {
    const ordered = fields ?? [
        ...PROPERTY_FIELD_ORDER,
        ...Object.keys(device || {}).filter(key => !PROPERTY_FIELD_ORDER.includes(key)),
    ];

    return ordered
        .filter(key => !INTERNAL_FIELDS.has(key))
        .map(key => [key, formatValue(key, device?.[key])])
        .filter(([, value]) => value);
};

const buildSyntheticCategories = (deviceInfo) => {
    const baseboard = deviceInfo?.baseboard;
    if (!baseboard || Object.keys(baseboard).length === 0) return [];

    const name = baseboard.product || baseboard.computerModel || '메인보드';
    return [{
        key: 'baseboard',
        label: '메인보드',
        count: 1,
        problemCount: 0,
        devices: [{
            ...baseboard,
            _treeKey: 'baseboard-main',
            name,
            category: 'BaseBoard',
            categoryLabel: '메인보드',
            manufacturer: baseboard.manufacturer || baseboard.computerManufacturer,
        }],
    }];
};

function PropertyTable({ entries }) {
    if (entries.length === 0) {
        return <p className="device-manager-empty-line">표시할 속성이 없습니다.</p>;
    }

    return (
        <div className="pm-manager-table-frame device-manager-property-table-frame">
            <table className="table table-hover align-middle mb-0 pm-manager-table device-manager-property-table">
                <tbody>
                    {entries.map(([key, value]) => (
                        <tr key={key}>
                            <th scope="row">{FIELD_LABELS[key] ?? key}</th>
                            <td>{value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DevicePropertiesModal({ device, onClose }) {
    const [activeTab, setActiveTab] = useState('general');
    const currentTab = PROPERTY_TABS.find(tab => tab.key === activeTab) ?? PROPERTY_TABS[0];
    const entries = propertyEntries(device, currentTab.key === 'details' ? undefined : currentTab.fields);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="device-manager-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="device-manager-property-modal"
                role="dialog"
                aria-modal="true"
                aria-label={`${device?.name || '장치'} 속성`}
                onMouseDown={event => event.stopPropagation()}
            >
                <header className="device-manager-property-titlebar">
                    <div>
                        <h3>{device?.name || '이름 없는 장치'}</h3>
                        <span>{device?.categoryLabel || '장치 속성'}</span>
                    </div>
                    <button type="button" className="device-manager-icon-button" onClick={onClose} aria-label="닫기">
                        <i className="bi bi-x-lg" aria-hidden="true"></i>
                    </button>
                </header>

                <nav className="device-manager-property-tabs" aria-label="속성 탭">
                    {PROPERTY_TABS.map(tab => (
                        <button
                            type="button"
                            key={tab.key}
                            className={activeTab === tab.key ? 'device-manager-property-tab-active' : ''}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="device-manager-property-content">
                    <div className={`device-manager-property-device ${device?.hasProblem ? 'device-manager-property-device-problem' : 'device-manager-property-device-ok'}`}>
                        <div>
                            <strong>{device?.status || (device?.hasProblem ? '문제 있음' : '정상')}</strong>
                            <span>{device?.hasProblem ? '장치에 오류 코드가 있습니다.' : '이 장치는 정상적으로 보고되었습니다.'}</span>
                        </div>
                    </div>
                    <PropertyTable entries={entries} />
                </div>

                <footer className="device-manager-property-footer">
                    <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>확인</button>
                </footer>
            </section>
        </div>
    );
}

function DeviceContextMenu({ menu, onOpenProperties, onClose }) {
    if (!menu) return null;

    return (
        <div
            className="device-manager-context-menu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            onContextMenu={event => event.preventDefault()}
        >
            <button type="button" role="menuitem" onClick={onOpenProperties}>
                <i className="bi bi-window" aria-hidden="true"></i>
                속성
            </button>
            <button type="button" role="menuitem" onClick={onClose}>
                <i className="bi bi-x" aria-hidden="true"></i>
                닫기
            </button>
        </div>
    );
}

function DeviceManager({ deviceInfo, isConnected, isLoading, onRefresh }) {
    const [expandedCategories, setExpandedCategories] = useState({});
    const [search, setSearch] = useState('');
    const [selectedDeviceKey, setSelectedDeviceKey] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [propertyDevice, setPropertyDevice] = useState(null);

    const categories = Array.isArray(deviceInfo?.categories) ? deviceInfo.categories : EMPTY_ARRAY;
    const allDevices = Array.isArray(deviceInfo?.devices) ? deviceInfo.devices : EMPTY_ARRAY;
    const treeCategories = useMemo(() => {
        const merged = [...buildSyntheticCategories(deviceInfo), ...categories];
        const query = search.trim().toLowerCase();
        return merged
            .map(category => {
                const devices = Array.isArray(category.devices) ? category.devices : [];
                const filteredDevices = query
                    ? devices.filter(device => searchable(device).includes(query))
                    : devices;
                return {
                    ...category,
                    icon: getCategoryIcon(category),
                    devices: filteredDevices,
                    count: devices.length,
                    visibleCount: filteredDevices.length,
                };
            })
            .filter(category => !query || category.visibleCount > 0);
    }, [categories, deviceInfo, search]);

    const summary = deviceInfo?.summary ?? {};
    const unsupported = deviceInfo && deviceInfo.supported === false;
    const searchActive = search.trim().length > 0;

    useEffect(() => {
        if (!contextMenu) return undefined;
        const close = () => setContextMenu(null);
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') close();
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu]);

    const toggleCategory = (key) => {
        setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const openProperties = (device) => {
        setContextMenu(null);
        setSelectedDeviceKey(deviceKey(device));
        setPropertyDevice(device);
    };

    const handleContextMenu = (event, device) => {
        event.preventDefault();
        const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
        const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
        const x = viewportWidth ? Math.min(event.clientX, viewportWidth - 180) : event.clientX;
        const y = viewportHeight ? Math.min(event.clientY, viewportHeight - 92) : event.clientY;
        setSelectedDeviceKey(deviceKey(device));
        setContextMenu({ x: Math.max(8, x), y: Math.max(8, y), device });
    };

    return (
        <div className="device-manager-shell">
            <header className="device-manager-header">
                <div>
                    <p className="device-manager-eyebrow">Device Inventory</p>
                    <h2>장치 관리자</h2>
                    <span>{deviceInfo?.nodeName || '선택한 노드'} · {deviceInfo?.osType || 'OS 장치 인벤토리'}</span>
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
                    <h5>이 노드는 장치 관리자 정보를 지원하지 않습니다.</h5>
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

                    <section className="device-manager-browser">
                        <div className="device-manager-toolbar">
                            <div>
                                <strong>종류별 장치</strong>
                                <span>장치를 클릭하거나 우클릭하면 속성을 볼 수 있습니다.</span>
                            </div>
                            <input
                                type="search"
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="장치명, 제조사, 드라이버 검색"
                                aria-label="장치 검색"
                            />
                        </div>

                        <div className="device-manager-tree" role="tree" aria-label="장치 관리자 트리">
                            {treeCategories.length === 0 ? (
                                <p className="device-manager-empty-line">조건에 맞는 장치가 없습니다.</p>
                            ) : (
                                treeCategories.map(category => {
                                    const expanded = searchActive || Boolean(expandedCategories[category.key]);
                                    return (
                                        <div className="device-manager-tree-category" key={category.key}>
                                            <button
                                                type="button"
                                                className="device-manager-tree-category-button"
                                                onClick={() => toggleCategory(category.key)}
                                                aria-expanded={expanded}
                                            >
                                                <i className={`bi ${expanded ? 'bi-chevron-down' : 'bi-chevron-right'}`} aria-hidden="true"></i>
                                                <i className={`bi ${category.icon}`} aria-hidden="true"></i>
                                                <span>{category.label}</span>
                                                <strong>{searchActive ? `${category.visibleCount}/${category.count}` : category.count}</strong>
                                            </button>

                                            {expanded && (
                                                <div className="device-manager-tree-devices" role="group">
                                                    {category.devices.map((device, index) => {
                                                        const key = deviceKey(device, index);
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={key}
                                                                className={`device-manager-tree-device ${selectedDeviceKey === key ? 'device-manager-tree-device-selected' : ''} ${device.hasProblem ? 'device-manager-tree-device-problem' : ''}`}
                                                                onClick={() => openProperties(device)}
                                                                onDoubleClick={() => openProperties(device)}
                                                                onContextMenu={event => handleContextMenu(event, device)}
                                                                title="클릭: 속성"
                                                            >
                                                                <span>{device.name || '이름 없는 장치'}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    <DeviceContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onOpenProperties={() => openProperties(contextMenu.device)}
                    />

                    {propertyDevice && (
                        <DevicePropertiesModal
                            device={propertyDevice}
                            onClose={() => setPropertyDevice(null)}
                        />
                    )}
                </>
            )}
        </div>
    );
}

export default DeviceManager;
