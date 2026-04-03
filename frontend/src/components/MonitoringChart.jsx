import React, { useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// recharts SVG 속성(stroke/fill)은 CSS 변수를 지원하지 않으므로 Bootstrap 표준 hex 값을 사용합니다.
const METRICS = [
    { key: 'cpu',     name: 'CPU',   color: '#0dcaf0', axis: 'percent' }, // bs-info
    { key: 'gpu',     name: 'GPU',   color: '#fd7e14', axis: 'percent' }, // bs-orange
    { key: 'memory',  name: '메모리', color: '#198754', axis: 'percent' }, // bs-success
    { key: 'disk',    name: '디스크', color: '#ffc107', axis: 'percent' }, // bs-warning
    { key: 'netSent', name: '송신',   color: '#d63384', axis: 'net'     }, // bs-pink
    { key: 'netRecv', name: '수신',   color: '#6f42c1', axis: 'net'     }, // bs-purple
];

function MonitoringChart({ history }) {
    const [visible, setVisible] = useState(
        Object.fromEntries(METRICS.map(m => [m.key, true]))
    );

    const toggle = (key) => setVisible(prev => ({ ...prev, [key]: !prev[key] }));

    const allVisible = METRICS.every(m => visible[m.key]);
    const anyVisible = METRICS.some(m => visible[m.key]);

    const toggleAll = () => {
        const next = !allVisible;
        setVisible(Object.fromEntries(METRICS.map(m => [m.key, next])));
    };

    return (
        <div className="mt-4">
            <h5 className="text-info mb-2">실시간 모니터링</h5>
            <div className="d-flex justify-content-end gap-4 mb-3">
                {METRICS.map(m => (
                    <div key={m.key} className="d-flex align-items-center gap-2">
                        <input
                            type="checkbox"
                            id={`check-${m.key}`}
                            checked={visible[m.key]}
                            onChange={() => toggle(m.key)}
                            style={{ accentColor: m.color, width: '1rem', height: '1rem', cursor: 'pointer', flexShrink: 0, outline: 'none' }}
                        />
                        <label
                            htmlFor={`check-${m.key}`}
                            style={{ color: m.color, fontSize: '0.9rem', cursor: 'pointer', marginBottom: 0 }}
                        >
                            {m.name}
                        </label>
                    </div>
                ))}
            </div>

            {anyVisible ? (
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={history} style={{ outline: 'none' }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="time" stroke="#888" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis yAxisId="percent" stroke="#888" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="net" orientation="right" stroke="#888" tick={{ fontSize: 11 }} unit=" KB" />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--bs-dark)', border: '1px solid var(--bs-border-color)', borderRadius: 6 }}
                            labelStyle={{ color: 'var(--bs-secondary-color)' }}
                        />
                        <Legend />
                        {METRICS.map(m => visible[m.key] && (
                            <Line
                                key={m.key}
                                type="monotone"
                                dataKey={m.key}
                                name={m.name}
                                stroke={m.color}
                                dot={false}
                                isAnimationActive={false}
                                strokeWidth={2}
                                yAxisId={m.axis}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <div className="d-flex align-items-center justify-content-center text-secondary" style={{ height: 400 }}>
                    표시할 항목을 선택해주세요
                </div>
            )}
        </div>
    );
}

export default MonitoringChart;
