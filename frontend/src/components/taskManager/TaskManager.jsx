import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { formatPartitionList, parseUptime } from './format.js';
import { CpuLogicalGraphs, MainGraph } from './graphs.jsx';
import {
    buildResources,
    CPU_LOGICAL_COLORS,
    getCpuLogicalValues,
    getNetworkResourceValues,
    getResourceHeadlineValue,
} from './resources.js';
import { CompactResourcePicker, SidebarItem } from './Sidebar.jsx';
import { StatsPanel, SystemInfoSection } from './StatsPanel.jsx';

const GRAPH_MIN_HEIGHT = 240;
const STATS_MIN_HEIGHT = 160;
const DESKTOP_GRAPH_FLEX_BASIS = '62%';
const DESKTOP_STATS_FLEX_BASIS = '38%';

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────
function TaskManager({ metrics, history, processes, systemInfo, liveDisks, liveNetworks }) {
    // systemInfo 기반으로 리소스 목록 동적 생성
    const resources = useMemo(() => buildResources(systemInfo), [systemInfo]);
    const isSmUp = useMediaQuery('(min-width: 576px)');
    const isMdUp = useMediaQuery('(min-width: 768px)');
    const isLgUp = useMediaQuery('(min-width: 992px)');
    const isXlUp = useMediaQuery('(min-width: 1200px)');
    const isResourceRailVisible = useMediaQuery('(min-width: 901px)');
    const resourceRailVariant = isXlUp ? 'xl' : (isLgUp ? 'lg' : 'md');

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
                <span style={{ color: resource.color2 ?? 'var(--pm-network-in)' }}>
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
                        border: '1px solid var(--pm-border-strong)',
                        background: 'var(--pm-primary-soft)',
                        color: 'var(--pm-text)',
                        borderRadius: 6,
                        fontSize: compact ? '0.72rem' : '0.76rem',
                        fontWeight: 600,
                    }}
                >
                    <span className="text-truncate">{cpuGraphOption.label}</span>
                    <span style={{ color: 'var(--pm-text-secondary)', fontSize: '0.7rem' }}>▼</span>
                </button>
                <div
                    className={`dropdown-menu dropdown-menu-dark ${cpuGraphDropdownOpen ? 'show' : ''}`}
                    style={{
                        minWidth: '100%',
                        marginTop: 4,
                        padding: 4,
                        background: 'var(--pm-surface-raised)',
                        border: '1px solid var(--pm-border-subtle)',
                        borderRadius: 6,
                        boxShadow: 'none',
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
                                background: option.key === effectiveCpuGraphMode ? 'var(--pm-primary-soft)' : 'transparent',
                                color: option.key === effectiveCpuGraphMode ? 'var(--pm-text)' : 'var(--pm-text-secondary)',
                            }}
                        >
                            <span className="d-block fw-semibold">{option.label}</span>
                            <span className="d-block" style={{ color: 'var(--pm-text-muted)', fontSize: '0.66rem' }}>
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

            {/* ── 왼쪽 리소스 패널 ── */}
            {isResourceRailVisible && (
                <div className="task-resource-rail d-flex flex-row flex-md-column flex-md-shrink-0"
                     style={{
                         borderRight: '1px solid var(--pm-border-subtle)',
                         borderBottom: '1px solid var(--pm-border-subtle)',
                         overflowX: 'auto',
                         overflowY: 'auto',
                         flexShrink: 0,
                         scrollbarWidth: 'none',
                         msOverflowStyle: 'none',
                     }}>
                    {resources.map(r => (
                        <SidebarItem key={r.key} resource={r} isActive={resource.key === r.key}
                                     metrics={metrics} history={history} variant={resourceRailVariant} onClick={() => {
                                         setSelected(r.key);
                                         setCpuGraphDropdownOpen(false);
                                     }} />
                    ))}
                </div>
            )}

            {/* ── 오른쪽 상세 패널 ── */}
            <div
                className="flex-grow-1 px-2 px-sm-3 d-flex flex-column"
                style={{ paddingTop: 10, paddingBottom: 10, minWidth: 0, width: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
            >
                {!isResourceRailVisible && (
                    <CompactResourcePicker
                        resources={resources}
                        selectedKey={resource.key}
                        metrics={metrics}
                        history={history}
                        onSelect={(key) => {
                            setSelected(key);
                            setCpuGraphDropdownOpen(false);
                        }}
                    />
                )}

                {/* 메인 차트 (PC) */}
                {isMdUp && (
                    <div className="d-flex flex-column mb-2 position-relative"
                         style={{ width: '100%', maxWidth: '100%', flex: `0 0 ${DESKTOP_GRAPH_FLEX_BASIS}`, minHeight: GRAPH_MIN_HEIGHT, minWidth: 0 }}>
                        <div
                            className="position-relative d-flex flex-column"
                            style={{ width: '100%', maxWidth: '100%', height: '100%', minHeight: 0 }}
                        >
                            {/* 헤더는 그래프 폭과 같은 컨테이너 안에 둬서 우측 값/버튼이 그래프 오른쪽 끝에 붙습니다. */}
                            <div className="d-flex justify-content-between align-items-baseline mb-2" style={{ width: '100%', flexShrink: 0 }}>
                                {renderTitle('1.95rem', '1.05rem')}
                                <div className="d-flex align-items-baseline gap-2 flex-shrink-1"
                                     style={{ minWidth: 0, maxWidth: '70%', flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 4 }}>
                                    {renderCpuGraphDropdown()}
                                    {subtitle && (
                                        <span className="d-none d-sm-inline"
                                              style={{
                                                  // 긴 CPU/디스크/GPU 모델명은 말줄임 없이 우측 영역 안에서 줄바꿈합니다.
                                                  color: 'var(--pm-text-muted)',
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
                                <div style={{ flex: '1 1 0', minHeight: 0 }}>
                                    <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} isMdUp={isMdUp} fillHeight />
                                </div>
                            ) : (
                                <div style={{ flex: '1 1 0', minHeight: 0 }}>
                                    <MainGraph history={history} resource={resource} isMdUp={isMdUp} fillHeight />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* xs: 매우 작은 화면 */}
                {!isSmUp && (
                    <div className="mb-2">
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
                            <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} isMdUp={isMdUp} columns={1} compact />
                        ) : (
                            <MainGraph history={history} resource={resource} isMdUp={isMdUp} mobileHeight={140} />
                        )}
                    </div>
                )}

                {/* sm~md */}
                {isSmUp && !isMdUp && (
                    <div className="mb-3">
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
                            <CpuLogicalGraphs history={history} resources={cpuLogicalResources} metrics={metrics} isMdUp={isMdUp} columns={2} compact />
                        ) : (
                            <MainGraph history={history} resource={resource} isMdUp={isMdUp} mobileHeight={180} />
                        )}
                    </div>
                )}

                {/* 세부 통계 */}
                <div
                    style={{
                        borderTop: '1px solid var(--pm-border-subtle)',
                        paddingTop: 12,
                        flex: `1 1 ${DESKTOP_STATS_FLEX_BASIS}`,
                        minHeight: STATS_MIN_HEIGHT,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                    }}
                >
                    {!systemInfo ? (
                        <div className="d-flex align-items-center gap-2" style={{ color: 'var(--pm-text-muted)', fontSize: '0.78rem' }}>
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
