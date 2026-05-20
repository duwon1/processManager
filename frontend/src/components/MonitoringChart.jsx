import React, { useState, useEffect, useRef } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';
import { useElementSize } from '../hooks/useElementSize.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';

// 퍼센트 계열 지표 (0~100% Y축)
const PERCENT_METRICS = [
    { key: 'cpu',    name: 'CPU',   color: 'var(--bs-info)'    },
    { key: 'gpu',    name: 'GPU',   color: 'var(--bs-pink)'    },
    { key: 'memory', name: '메모리', color: 'var(--bs-success)' },
    { key: 'disk',   name: '디스크', color: 'var(--bs-warning)' },
];

// 네트워크 계열 지표 (KB Y축)
const NET_METRICS = [
    { key: 'netSent', name: '송신', color: 'var(--bs-orange)' },
    { key: 'netRecv', name: '수신', color: 'var(--bs-purple)' },
];
const MONITORING_CHART_MIN_HEIGHT = 220;

// 공통 Tooltip 스타일
const tooltipStyle = {
    contentStyle: { backgroundColor: 'var(--bs-dark)', border: '1px solid var(--bs-border-color)', borderRadius: 6 },
    labelStyle: { color: 'var(--bs-secondary-color)' },
};

// 체크박스 토글 UI 컴포넌트
function CheckboxGroup({ metrics, visible, onToggle }) {
    return (
        <div className="d-flex flex-wrap gap-2 gap-sm-3 mb-2">
            {metrics.map(m => (
                <div key={m.key} className="d-flex align-items-center gap-1">
                    <input
                        type="checkbox"
                        id={`check-${m.key}`}
                        checked={visible[m.key]}
                        onChange={() => onToggle(m.key)}
                        style={{ accentColor: m.color, width: '0.85rem', height: '0.85rem', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <label htmlFor={`check-${m.key}`}
                           style={{ color: m.color, fontSize: '0.82rem', cursor: 'pointer', marginBottom: 0 }}>
                        {m.name}
                    </label>
                </div>
            ))}
        </div>
    );
}

// 컨테이너 너비를 측정해 세로선 15개의 x 좌표를 계산합니다.
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

// 단일 차트 컴포넌트 — yTicks: Y축 고정 눈금 (없으면 자동)
function Chart({ history, metrics, visible, yUnit, yDomain, yTicks, height, mobileHeight, fillHeight = false }) {
    const isMdUp = useMediaQuery('(min-width: 768px)');
    const anyVisible = metrics.some(m => visible[m.key]);
    const pcRef     = useRef(null);
    const mobileRef = useRef(null);
    const pcSize = useElementSize(pcRef);
    const mobileSize = useElementSize(mobileRef);
    const canRenderPcChart = pcSize.width > 0 && (!fillHeight || pcSize.height > 0);
    const canRenderMobileChart = mobileSize.width > 0;
    // PC Y축 너비 60px, 모바일 20px (margin left -16 보정)
    const pcPoints     = useVerticalPoints(pcRef, 60);
    const mobilePoints = useVerticalPoints(mobileRef, 20, 8);

    if (!anyVisible) {
        return (
            <div className="d-flex align-items-center justify-content-center text-secondary border border-secondary border-opacity-25 rounded"
                 style={{ height: fillHeight ? '100%' : 60, minHeight: 60 }}>
                표시할 항목을 선택해주세요
            </div>
        );
    }

    // visible이 false인 항목은 null 대신 완전히 제거합니다 (React 경고 방지)
    const lines = metrics.filter(m => visible[m.key]).map(m => (
        <Line key={m.key} type="monotone" dataKey={m.key} name={m.name}
              stroke={m.color} dot={false} isAnimationActive={false} strokeWidth={2} connectNulls={false} />
    ));

    // 첫/마지막 tick만 0s/60s로 렌더링하는 커스텀 tick
    const makeTick = (fontSize) => (props) => {
        const { x, y, index, visibleTicksCount } = props;
        if (index !== 0 && index !== visibleTicksCount - 1) return <g />;
        const isLast = index === visibleTicksCount - 1;
        return (
            <text x={x} y={y + 12} textAnchor={isLast ? 'end' : 'start'}
                  fill="var(--bs-secondary-color)" fontSize={fontSize}>
                {isLast ? '60s' : '0s'}
            </text>
        );
    };

    return (
        isMdUp ? (
            <div ref={pcRef} style={{ minWidth: 0, height: fillHeight ? '100%' : height }}>
                {canRenderPcChart && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history} style={{ outline: 'none' }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.07)" verticalPoints={pcPoints} />
                            <XAxis dataKey="time" interval={0} tick={makeTick(11)} tickLine={false} />
                            <YAxis stroke="var(--bs-secondary-color)" domain={yDomain} unit={yUnit} tick={{ fontSize: 11 }} ticks={yTicks} />
                            <Tooltip {...tooltipStyle} />
                            {lines}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        ) : (
            <div ref={mobileRef} style={{ minWidth: 0, height: mobileHeight }}>
                {canRenderMobileChart && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history} style={{ outline: 'none' }} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.07)" verticalPoints={mobilePoints} />
                            <XAxis dataKey="time" interval={0} tick={makeTick(9)} tickLine={false} />
                            <YAxis stroke="var(--bs-secondary-color)" domain={yDomain} unit={yUnit} tick={{ fontSize: 9 }} width={36} ticks={yTicks} />
                            <Tooltip {...tooltipStyle} />
                            {lines}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        )
    );
}

function MonitoringChart({ history }) {
    const isMdUp = useMediaQuery('(min-width: 768px)');
    const [visible, setVisible] = useState(
        Object.fromEntries([...PERCENT_METRICS, ...NET_METRICS].map(m => [m.key, true]))
    );
    const toggle = (key) => setVisible(prev => ({ ...prev, [key]: !prev[key] }));
    const renderChartSection = ({ title, metrics, yUnit, yDomain, yTicks, height, mobileHeight, fillHeight = false }) => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                flex: fillHeight ? '1 1 0' : undefined,
                minHeight: fillHeight ? MONITORING_CHART_MIN_HEIGHT : undefined,
                minWidth: 0,
                overflow: fillHeight ? 'hidden' : undefined,
            }}
        >
            <h6 className="text-info mb-2" style={{ fontSize: '0.9rem', flexShrink: 0 }}>{title}</h6>
            <div style={{ flexShrink: 0 }}>
                <CheckboxGroup metrics={metrics} visible={visible} onToggle={toggle} />
            </div>
            <div style={{ flex: fillHeight ? '1 1 0' : undefined, minHeight: fillHeight ? 0 : undefined }}>
                <Chart
                    history={history}
                    metrics={metrics}
                    visible={visible}
                    yUnit={yUnit}
                    yDomain={yDomain}
                    yTicks={yTicks}
                    height={height}
                    mobileHeight={mobileHeight}
                    fillHeight={fillHeight}
                />
            </div>
        </div>
    );

    return (
        <>
            {isMdUp ? (
                <div
                    className="mt-3 d-flex flex-column gap-3"
                    style={{ flex: '1 1 0', minHeight: (MONITORING_CHART_MIN_HEIGHT * 2) + 16, overflow: 'hidden' }}
                >
                    {renderChartSection({
                        title: '리소스 사용률',
                        metrics: PERCENT_METRICS,
                        yUnit: '%',
                        yDomain: [0, 100],
                        yTicks: [0, 25, 50, 75, 100],
                        height: 250,
                        mobileHeight: 180,
                        fillHeight: true,
                    })}
                    {renderChartSection({
                        title: '네트워크',
                        metrics: NET_METRICS,
                        yUnit: ' KB',
                        yDomain: ['auto', 'auto'],
                        height: 250,
                        mobileHeight: 180,
                        fillHeight: true,
                    })}
                </div>
            ) : (
                <div className="mt-4 d-flex flex-column gap-4" style={{ overflow: 'hidden' }}>
                    {renderChartSection({
                        title: '리소스 사용률',
                        metrics: PERCENT_METRICS,
                        yUnit: '%',
                        yDomain: [0, 100],
                        yTicks: [0, 25, 50, 75, 100],
                        height: 250,
                        mobileHeight: 180,
                    })}
                    {renderChartSection({
                        title: '네트워크',
                        metrics: NET_METRICS,
                        yUnit: ' KB',
                        yDomain: ['auto', 'auto'],
                        height: 250,
                        mobileHeight: 180,
                    })}
                </div>
            )}
        </>
    );
}

export default MonitoringChart;
