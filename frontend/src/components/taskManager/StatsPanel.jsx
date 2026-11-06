import React from 'react';
import { formatByUnit, formatDuration, formatPair, formatPartitionList, formatSectionValue, fmtUptime, ITEM_LABELS } from './format.js';
import { getNetworkResourceValues, getResourcePercent, getVal, mergeLiveDisk, mergeLiveNetwork } from './resources.js';

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

function Stat({ label, value, variant = 'primary' }) {
    const displayValue = value ?? 'N/A';
    const compact = variant === 'secondary';
    return (
        /* grid 셀 안에서 긴 값만 줄바꿈하고, 한글 단어는 글자 단위로 쪼개지지 않게 합니다. */
        <div title={`${label}: ${displayValue}`} style={{ minWidth: 0, minHeight: compact ? 30 : 46, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ color: 'var(--pm-text-muted)', fontSize: compact ? '0.68rem' : '0.76rem', lineHeight: 1.25, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ color: 'var(--pm-text)', fontSize: compact ? '0.82rem' : '1.18rem', fontWeight: compact ? 500 : 600, lineHeight: compact ? 1.25 : 1.16, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
                {displayValue}
            </div>
        </div>
    );
}

// 값이 없거나 N/A면 렌더링하지 않는 조건부 stat 항목
const OptionalStat = ({ label, value, variant = 'primary' }) => {
    if (value === null || value === undefined || value === '' || value === 'N/A') return null;
    return <Stat label={label} value={value} variant={variant} />;
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
            <Stat key={item.key} label={ITEM_LABELS[item.key] ?? item.key} value={formatted} variant="secondary" />
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

export function SystemInfoSection({ sections }) {
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
                    <Stat key={item.key} label={ITEM_LABELS[item.key] ?? item.key} value={formatted} variant="secondary" />
                ))}
            </StatGrid>
        </details>
    );
}

// ── 리소스별 전체 세부 정보 패널 ─────────────────────────────────────────
export function StatsPanel({ resource, metrics, history, processes, systemInfo, uptime, sections, liveDisks, liveNetworks }) {
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
                        <Stat label="이용률" value={getVal(metrics, 1)} />
                        <Stat label="속도" value={getVal(metrics, 7)} />
                        <Stat label="프로세스" value={`${processes.length}`} />
                        {totalThreads > 0 && <Stat label="스레드" value={`${totalThreads}`} />}
                        {totalHandles > 0 && <Stat label="핸들" value={`${totalHandles}`} />}
                        <Stat label="작동 시간" value={uptime !== null ? fmtUptime(uptime) : (formatDuration(si?.cpu?.uptimeSeconds) ?? 'N/A')} />
                    </>
                )}
                secondary={(
                    <>
                        <StatGrid variant="secondary">
                            <Stat label="기본 속도" value={formatByUnit(si?.cpu?.baseSpeedMhz, 'mhz') ?? 'N/A'} variant="secondary" />
                            <Stat label="소켓" value={si?.cpu?.sockets ?? 'N/A'} variant="secondary" />
                            <Stat label="코어" value={si?.cpu?.cores ?? 'N/A'} variant="secondary" />
                            <Stat label="논리 프로세서" value={si?.cpu?.logicalProcessors ?? 'N/A'} variant="secondary" />
                            <Stat label="가상화" value={formatByUnit(si?.cpu?.virtualization) ?? 'N/A'} variant="secondary" />
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
                            <Stat label="전체" value={formatByUnit(si?.memory?.totalBytes, 'bytes') ?? 'N/A'} />
                            <Stat label="사용 중" value={getVal(metrics, 8)} />
                            <Stat label="사용 가능" value={getVal(metrics, 9)} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <OptionalStat label="커밋됨" value={getVal(metrics, 11) !== 'N/A' ? (si?.memory?.commitLimitBytes ? `${getVal(metrics, 11)} / ${formatByUnit(si.memory.commitLimitBytes, 'bytes')}` : getVal(metrics, 11)) : null} variant="secondary" />
                                <OptionalStat label="캐시됨" value={getVal(metrics, 10) !== 'N/A' ? getVal(metrics, 10) : null} variant="secondary" />
                                <OptionalStat label="페이징 풀" value={formatByUnit(si?.memory?.pagedPoolBytes, 'bytes')} variant="secondary" />
                                <OptionalStat label="비페이징 풀" value={formatByUnit(si?.memory?.nonPagedPoolBytes, 'bytes')} variant="secondary" />
                                <OptionalStat label="하드웨어 예약" value={formatByUnit(si?.memory?.hardwareReservedBytes, 'bytes')} variant="secondary" />
                                <OptionalStat label="속도" value={formatByUnit(si?.memory?.speedMtPerSecond, 'mtPerSecond') ?? si?.memory?.speedMhz} variant="secondary" />
                                <OptionalStat label="사용된 슬롯" value={slots} variant="secondary" />
                                <OptionalStat label="폼팩터" value={si?.memory?.formFactor} variant="secondary" />
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
                            <Stat label="활성 시간" value={diskActiveTime} />
                            <OptionalStat label="읽기 속도" value={formatByUnit(disk?.readBytesPerSecond, 'bytesPerSecond') ?? getVal(metrics, 12)} />
                            <OptionalStat label="쓰기 속도" value={formatByUnit(disk?.writeBytesPerSecond, 'bytesPerSecond') ?? getVal(metrics, 13)} />
                            <OptionalStat label="평균 응답 시간" value={formatByUnit(disk?.averageResponseTimeMs, 'ms')} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <OptionalStat label="용량" value={formatByUnit(disk?.totalBytes, 'bytes') ?? disk?.total} variant="secondary" />
                                <OptionalStat label="사용됨" value={formatByUnit(disk?.usedBytes, 'bytes') ?? disk?.used} variant="secondary" />
                                <OptionalStat label="여유 공간" value={formatByUnit(disk?.freeBytes, 'bytes') ?? disk?.free} variant="secondary" />
                                <OptionalStat label="용량 사용률" value={formatByUnit(disk?.capacityUsagePercent ?? disk?.usagePercent, 'percent')} variant="secondary" />
                                <OptionalStat label="큐 길이" value={formatByUnit(disk?.queueLength, 'count')} variant="secondary" />
                                <OptionalStat label="파티션" value={formatPartitionList(disk?.partitions ?? disk?.mountpoint)} variant="secondary" />
                                <OptionalStat label="파일시스템" value={disk?.fstype} variant="secondary" />
                                <OptionalStat label="종류" value={disk?.type} variant="secondary" />
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
                            <Stat label="보내기" value={sent} />
                            <Stat label="받기" value={recv} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <OptionalStat label="링크 속도" value={formatByUnit(net?.speedBitsPerSecond, 'bitsPerSecond')} variant="secondary" />
                                <OptionalStat label="IPv4 주소" value={net?.ipv4} variant="secondary" />
                                <OptionalStat label="IPv6 주소" value={net?.ipv6} variant="secondary" />
                                <OptionalStat label="MAC 주소" value={net?.macAddress} variant="secondary" />
                                <OptionalStat label="SSID" value={net?.ssid} variant="secondary" />
                                <OptionalStat label="신호 강도" value={formatByUnit(net?.signalStrengthDbm, 'dbm') ?? net?.signalStrength} variant="secondary" />
                                <OptionalStat label="어댑터 이름" value={net?.adapterName} variant="secondary" />
                                <OptionalStat label="연결 형식" value={formatByUnit(net?.connectionType) ?? net?.connectionType} variant="secondary" />
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
                            <Stat label="사용률" value={getVal(metrics, 2)} />
                            <Stat label="온도" value={formatByUnit(gpu?.temperatureCelsius, 'celsius')} />
                            <Stat label="GPU 메모리" value={gpuMemory} />
                            <Stat label="전용 GPU 메모리" value={dedicatedMemory} />
                            <Stat label="공유 GPU 메모리" value={sharedMemory} />
                            <Stat label="하드웨어 예약" value={hardwareReservedMemory} />
                        </>
                    )}
                    secondary={(
                        <>
                            <StatGrid variant="secondary">
                                <Stat label="표시 메모리" value={displayMemory} variant="secondary" />
                                <Stat label="드라이버 버전" value={gpu?.driverVersion} variant="secondary" />
                                <Stat label="드라이버 날짜" value={gpu?.driverDate} variant="secondary" />
                                <Stat label="DirectX 버전" value={gpu?.directXVersion} variant="secondary" />
                                <Stat label="DDI 버전" value={gpu?.ddiVersion} variant="secondary" />
                                <Stat label="드라이버 모델" value={gpu?.driverModel} variant="secondary" />
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
