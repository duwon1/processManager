import React, { useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const METRICS = [
    { key: 'cpu',     name: 'CPU',   color: '#17a2b8', axis: 'percent' },
    { key: 'gpu',     name: 'GPU',   color: '#fd7e14', axis: 'percent' },
    { key: 'memory',  name: '메모리', color: '#28a745', axis: 'percent' },
    { key: 'disk',    name: '디스크', color: '#ffc107', axis: 'percent' },
    { key: 'netSent', name: '송신',   color: '#e83e8c', axis: 'net' },
    { key: 'netRecv', name: '수신',   color: '#6f42c1', axis: 'net' },
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
                            contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 6 }}
                            labelStyle={{ color: '#aaa' }}
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
