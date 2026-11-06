import React, { useMemo, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis,
    Tooltip, CartesianGrid,
} from 'recharts';
import { useElementSize } from '../../hooks/useElementSize.js';
import { formatChartValue } from './format.js';
import { getCpuLogicalPercent } from './resources.js';

const CPU_LOGICAL_GRID_GAP = 10;

// ── 왼쪽 패널 미니 그래프 ────────────────────────────────────────────────
export function MiniGraph({ history, resource }) {
    const colors = resource.colors ?? [resource.color, resource.color2].filter(Boolean);
    const graphRef = useRef(null);
    const { width, height } = useElementSize(graphRef);
    return (
        <div ref={graphRef} style={{ background: 'var(--pm-bg)', borderRadius: 3, height: 64 }}>
            {width > 0 && height > 0 && (
                <AreaChart width={width} height={64} data={history} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                    <YAxis hide domain={[0, resource.max ?? 'auto']} />
                    {resource.dataKeys.map((dk, i) => (
                        <Area key={dk} type="monotone" dataKey={dk}
                              stroke={colors[i] ?? colors[0]} fill={colors[i] ?? colors[0]}
                              fillOpacity={0.2} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                    ))}
                </AreaChart>
            )}
        </div>
    );
}

// ── 오른쪽 메인 차트 ─────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
    contentStyle: { background: 'var(--pm-surface-raised)', border: '1px solid var(--pm-border-subtle)', borderRadius: 4, fontSize: '0.8rem' },
    labelStyle:   { color: 'var(--pm-text-muted)', fontSize: '0.72rem' },
};

const makeVerticalPoints = (width, yAxisWidth, count = 15) => {
    if (width <= 0) return [];
    const chartW = Math.max(0, width - yAxisWidth);
    return Array.from({ length: count }, (_, i) => yAxisWidth + (i + 1) * chartW / (count + 1));
};

// 첫/마지막 tick만 0s/60s로 렌더링하는 커스텀 tick
const makeTimeTick = (fontSize) => (props) => {
    const { x, y, index, visibleTicksCount } = props;
    if (index !== 0 && index !== visibleTicksCount - 1) return <g />;
    const isLast = index === visibleTicksCount - 1;
    return (
        <text x={x} y={y + 12} textAnchor={isLast ? 'end' : 'start'}
              fill="var(--pm-text-muted)" fontSize={fontSize}>
            {isLast ? '60s' : '0s'}
        </text>
    );
};
const PC_TIME_TICK = makeTimeTick(12);
const MOBILE_TIME_TICK = makeTimeTick(9);

export function MainGraph({ history, resource, isMdUp, pcHeight = 500, mobileHeight = 200, hideText = false, fillHeight = false }) {
    const colors  = resource.colors ?? [resource.color, resource.color2].filter(Boolean);
    const pcRef   = useRef(null);
    const mobRef  = useRef(null);
    const pcSize = useElementSize(pcRef);
    const mobSize = useElementSize(mobRef);
    const pcTopPadding = hideText ? 4 : 22;
    const mobileTopPadding = hideText ? 2 : 8;
    const pcChartHeight = fillHeight ? pcSize.height - pcTopPadding : pcHeight;
    const canRenderPcChart = pcSize.width > 0 && pcChartHeight > 0;
    const canRenderMobileChart = mobSize.width > 0;
    const pcYAxisWidth = hideText ? 0 : (resource.type === 'network' ? 72 : 54);
    const mobYAxisWidth = hideText ? 0 : (resource.type === 'network' ? 58 : 46);
    const pcPoints = useMemo(
        () => makeVerticalPoints(pcSize.width, pcYAxisWidth),
        [pcSize.width, pcYAxisWidth]
    );
    const mobPoints = useMemo(
        () => makeVerticalPoints(mobSize.width, mobYAxisWidth, 8),
        [mobSize.width, mobYAxisWidth]
    );
    const pcMargin = hideText ? { top: 4, right: 4, left: 0, bottom: 0 } : { top: 4, right: 12, left: 0, bottom: 4 };
    const mobileMargin = hideText ? { top: 2, right: 4, left: 0, bottom: 0 } : { top: 4, right: 6, left: 0, bottom: 8 };
    return (
        <div className="position-relative"
             style={{
                 background: 'var(--pm-bg)',
                 border: '1px solid var(--pm-border-subtle)',
                 borderRadius: 4,
                 height: fillHeight ? '100%' : undefined,
                 minHeight: fillHeight ? 0 : undefined,
            }}>
            {/* 차트 타이틀 오버레이 */}
            {!hideText && isMdUp && (
                <div className="position-absolute d-flex justify-content-between w-100 px-2"
                     style={{ top: 6, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                    <span style={{ color: 'var(--pm-text-muted)', fontSize: '0.68rem' }}>{resource.yLabel}</span>
                    <span style={{ color: 'var(--pm-text-muted)', fontSize: '0.68rem' }}>60초</span>
                </div>
            )}

            {isMdUp ? (
                <div style={{ paddingTop: pcTopPadding, height: fillHeight ? '100%' : pcHeight + pcTopPadding, boxSizing: 'border-box' }} ref={pcRef}>
                    {canRenderPcChart && (
                        <AreaChart width={pcSize.width} height={pcChartHeight} data={history} margin={pcMargin}>
                            <CartesianGrid stroke="var(--pm-border-subtle)" verticalPoints={pcPoints} />
                            <XAxis dataKey="time" hide={hideText} interval={0} tick={PC_TIME_TICK} tickLine={false} axisLine={false} />
                            <YAxis domain={[0, resource.max ?? 'auto']}
                                   hide={hideText}
                                   tick={{ fill: 'var(--pm-text-muted)', fontSize: 12 }}
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
                    )}
                </div>
            ) : (
                <div style={{ paddingTop: mobileTopPadding }} ref={mobRef}>
                    {canRenderMobileChart && (
                        <AreaChart width={mobSize.width} height={mobileHeight} data={history} margin={mobileMargin}>
                            <CartesianGrid stroke="var(--pm-border-subtle)" verticalPoints={mobPoints} />
                            <XAxis dataKey="time" hide={hideText} interval={0} tick={MOBILE_TIME_TICK} tickLine={false} axisLine={false} />
                            <YAxis domain={[0, resource.max ?? 'auto']}
                                   hide={hideText}
                                   tick={{ fill: 'var(--pm-text-muted)', fontSize: 9 }}
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
                    )}
                </div>
            )}
        </div>
    );
}

// ── 세부 통계 항목 ────────────────────────────────────────────────────────
const getCpuLogicalColumnCount = (count) => {
    if (count <= 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    if (count === 4) return 2;
    return 4;
};

export function CpuLogicalGraphs({ history, resources, metrics, isMdUp, columns, compact = false, fillHeight = false }) {
    if (!Array.isArray(resources) || resources.length === 0) return null;

    const columnCount = Math.max(1, Math.min(columns ?? getCpuLogicalColumnCount(resources.length), resources.length));
    const gap = CPU_LOGICAL_GRID_GAP;
    const chartHeight = compact ? 92 : 118;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gridAutoRows: fillHeight ? 'minmax(0, 1fr)' : undefined,
                gap,
                width: '100%',
                height: fillHeight ? '100%' : undefined,
                minHeight: fillHeight ? 0 : undefined,
            }}
        >
            {resources.map((cpuResource, index) => {
                const percent = getCpuLogicalPercent(cpuResource.dataKeys[0], metrics, history);
                return (
                    <div key={cpuResource.key} style={{ minWidth: 0 }}>
                        <div
                            style={{
                                height: fillHeight ? '100%' : undefined,
                                minWidth: 0,
                                minHeight: fillHeight ? 0 : undefined,
                                border: '1px solid var(--pm-border-subtle)',
                                borderRadius: 6,
                                padding: 8,
                                background: 'var(--pm-surface-soft)',
                                display: fillHeight ? 'flex' : undefined,
                                flexDirection: fillHeight ? 'column' : undefined,
                            }}
                        >
                            <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                                <span
                                    className="text-truncate"
                                    style={{ color: cpuResource.color, fontSize: '0.76rem', fontWeight: 700 }}
                                >
                                    논리 {index + 1}
                                </span>
                                <span style={{ color: 'var(--pm-text-secondary)', fontSize: '0.72rem', fontWeight: 600 }}>
                                    {percent === null ? 'N/A' : `${percent.toFixed(1)}%`}
                                </span>
                            </div>
                            <div style={{ flex: fillHeight ? '1 1 0' : undefined, minHeight: fillHeight ? 0 : undefined }}>
                                <MainGraph history={history} resource={cpuResource} isMdUp={isMdUp} pcHeight={chartHeight} mobileHeight={chartHeight} hideText fillHeight={fillHeight} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
