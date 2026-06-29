import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppHeader } from '../hooks/useAppHeader';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useToast } from '../context/ToastContext';
import { readApiErrorMessage } from '../utils/apiErrorMessage';
import { submitOnEnter } from '../utils/submitOnEnter';

const HEADER = { title: '알림 규칙' };

const METRIC_OPTIONS = [
    { value: 'CPU_USAGE', label: 'CPU 사용률', icon: 'bi-cpu' },
    { value: 'GPU_USAGE', label: 'GPU 사용률', icon: 'bi-gpu-card' },
    { value: 'MEMORY_USAGE', label: '메모리 사용률', icon: 'bi-memory' },
    { value: 'DISK_USAGE', label: '디스크 사용률', icon: 'bi-hdd' },
];

const FIXED_SEVERITY = 'warning';
const COOLDOWN_PRESETS = [
    { label: '30초', value: 30 },
    { label: '1분', value: 60 },
    { label: '5분', value: 300 },
    { label: '30분', value: 1800 },
    { label: '1시간', value: 3600 },
];

const DEFAULT_FORM = {
    id: null,
    name: '',
    nodeId: '',
    nodeIds: [],
    nodeMode: 'ALL',
    metricType: 'CPU_USAGE',
    metricTypes: ['CPU_USAGE'],
    severity: FIXED_SEVERITY,
    thresholdPercent: 80,
    durationSeconds: 60,
    cooldownSeconds: 300,
    enabled: true,
};

const metricLabel = (metricType) => (
    METRIC_OPTIONS.find(option => option.value === metricType)?.label || metricType
);

const formatSeconds = (seconds) => {
    const value = Number(seconds) || 0;
    if (value >= 3600) return `${Math.round(value / 3600)}시간`;
    if (value >= 60) return `${Math.round(value / 60)}분`;
    return `${value}초`;
};

const clampTimeValue = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

const splitTimeParts = (seconds) => {
    const total = clampTimeValue(seconds, 0, 86400);
    return {
        hours: Math.floor(total / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
    };
};

const combineTimeParts = (parts, min, max) => clampTimeValue(
    (Number(parts.hours) || 0) * 3600
        + (Number(parts.minutes) || 0) * 60
        + (Number(parts.seconds) || 0),
    min,
    max
);

export function NotificationRulesContent() {
    const authFetch = useAuthFetch();
    const { showToast } = useToast();
    const [rules, setRules] = useState([]);
    const [nodes, setNodes] = useState([]);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    const ownedNodes = useMemo(() => nodes.filter(node => node.owner), [nodes]);
    const editing = Boolean(form.id);
    const selectedMetricValues = useMemo(() => {
        if (editing) return [form.metricType || 'CPU_USAGE'];
        const values = Array.isArray(form.metricTypes) ? form.metricTypes : [];
        return values.length > 0 ? values : [form.metricType || 'CPU_USAGE'];
    }, [editing, form.metricType, form.metricTypes]);
    const selectedMetric = METRIC_OPTIONS.find(option => option.value === selectedMetricValues[0]) || METRIC_OPTIONS[0];
    const selectedNodeValues = useMemo(() => {
        if (editing) return form.nodeId ? [String(form.nodeId)] : [''];
        if (form.nodeMode !== 'SPECIFIC') return [''];
        return Array.isArray(form.nodeIds) ? form.nodeIds.map(String) : [];
    }, [editing, form.nodeId, form.nodeIds, form.nodeMode]);
    const batchCreateCount = editing ? 1 : selectedMetricValues.length * selectedNodeValues.length;
    const cooldownParts = useMemo(() => splitTimeParts(form.cooldownSeconds), [form.cooldownSeconds]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rulesRes, nodesRes] = await Promise.all([
                authFetch('/api/notification-rules'),
                authFetch('/api/node/list'),
            ]);
            setRules(rulesRes?.ok ? await rulesRes.json() : []);
            setNodes(nodesRes?.ok ? await nodesRes.json() : []);
        } catch {
            setRules([]);
            setNodes([]);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        load();
    }, [load]);

    const resetForm = () => setForm(DEFAULT_FORM);

    const updateForm = (key, value) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const selectRule = (rule) => {
        setForm({
            id: rule.id,
            name: rule.name || '',
            nodeId: rule.nodeId ? String(rule.nodeId) : '',
            nodeIds: rule.nodeId ? [String(rule.nodeId)] : [],
            nodeMode: rule.nodeId ? 'SPECIFIC' : 'ALL',
            metricType: rule.metricType || 'CPU_USAGE',
            metricTypes: [rule.metricType || 'CPU_USAGE'],
            severity: FIXED_SEVERITY,
            thresholdPercent: Number(rule.thresholdPercent ?? 80),
            durationSeconds: Number(rule.durationSeconds ?? 60),
            cooldownSeconds: Number(rule.cooldownSeconds ?? 300),
            enabled: rule.enabled !== false,
        });
    };

    const buildPayload = (source = form) => ({
        name: source.name,
        nodeId: source.nodeId ? Number(source.nodeId) : null,
        metricType: source.metricType,
        severity: FIXED_SEVERITY,
        thresholdPercent: Number(source.thresholdPercent),
        durationSeconds: Number(source.durationSeconds),
        cooldownSeconds: Number(source.cooldownSeconds),
        enabled: Boolean(source.enabled),
    });

    const nodeLabel = (nodeId) => {
        if (!nodeId) return '전체 내 노드';
        return nodes.find(node => String(node.id) === String(nodeId))?.name || '선택 노드';
    };

    const ruleNameFor = (metricType, nodeId, totalCount) => {
        const baseName = form.name.trim();
        if (baseName && totalCount === 1) return baseName;
        const parts = [
            baseName || `${metricLabel(metricType)} ${Number(form.thresholdPercent || 0).toFixed(0)}% 이상`,
        ];
        if (totalCount > 1) {
            if (baseName) parts.push(metricLabel(metricType));
            parts.push(nodeLabel(nodeId));
        }
        return parts.join(' · ').slice(0, 120);
    };

    const toggleMetric = (metricType) => {
        if (editing) {
            setForm(prev => ({ ...prev, metricType, metricTypes: [metricType] }));
            return;
        }
        setForm(prev => {
            const values = Array.isArray(prev.metricTypes) ? prev.metricTypes : [];
            const exists = values.includes(metricType);
            const next = exists
                ? values.filter(value => value !== metricType)
                : [...values, metricType];
            const normalized = next.length > 0 ? next : [metricType];
            return { ...prev, metricTypes: normalized, metricType: normalized[0] };
        });
    };

    const setTargetMode = (nodeMode) => {
        setForm(prev => ({
            ...prev,
            nodeMode,
            nodeId: nodeMode === 'ALL' ? '' : (prev.nodeIds?.[0] || ''),
            nodeIds: nodeMode === 'ALL' ? [] : prev.nodeIds,
        }));
    };

    const toggleNode = (nodeId) => {
        const value = String(nodeId);
        setForm(prev => {
            const values = Array.isArray(prev.nodeIds) ? prev.nodeIds : [];
            const next = values.includes(value)
                ? values.filter(item => item !== value)
                : [...values, value];
            return { ...prev, nodeMode: 'SPECIFIC', nodeIds: next, nodeId: next[0] || '' };
        });
    };

    const selectAllNodes = () => {
        const ids = ownedNodes.map(node => String(node.id));
        setForm(prev => ({ ...prev, nodeMode: 'SPECIFIC', nodeIds: ids, nodeId: ids[0] || '' }));
    };

    const clearNodeSelection = () => {
        setForm(prev => ({ ...prev, nodeMode: 'SPECIFIC', nodeIds: [], nodeId: '' }));
    };

    const updateCooldownPart = (part, value) => {
        const limits = { hours: 24, minutes: 59, seconds: 59 };
        const nextParts = {
            ...cooldownParts,
            [part]: clampTimeValue(value, 0, limits[part] ?? 59),
        };
        updateForm('cooldownSeconds', combineTimeParts(nextParts, 30, 86400));
    };

    const saveRule = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            if (!editing && form.nodeMode === 'SPECIFIC' && selectedNodeValues.length === 0) {
                showToast('warning', '대상 노드를 선택하세요.');
                return;
            }

            if (editing) {
                const res = await authFetch(`/api/notification-rules/${form.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildPayload()),
                });
                if (!res?.ok) {
                    if (res) showToast('danger', await readApiErrorMessage(res, '알림 규칙 저장에 실패했습니다.'));
                    return;
                }
                const saved = await res.json();
                setRules(prev => {
                    const next = prev.filter(rule => rule.id !== saved.id);
                    return [saved, ...next];
                });
                setForm({
                    ...DEFAULT_FORM,
                    id: saved.id,
                    name: saved.name || '',
                    nodeId: saved.nodeId ? String(saved.nodeId) : '',
                    nodeIds: saved.nodeId ? [String(saved.nodeId)] : [],
                    nodeMode: saved.nodeId ? 'SPECIFIC' : 'ALL',
                    metricType: saved.metricType,
                    metricTypes: [saved.metricType],
                    severity: FIXED_SEVERITY,
                    thresholdPercent: Number(saved.thresholdPercent),
                    durationSeconds: Number(saved.durationSeconds),
                    cooldownSeconds: Number(saved.cooldownSeconds),
                    enabled: saved.enabled !== false,
                });
                showToast('success', '알림 규칙을 저장했습니다.');
                return;
            }

            const jobs = selectedNodeValues.flatMap(nodeId => (
                selectedMetricValues.map(metricType => ({ nodeId, metricType }))
            ));
            const savedRules = [];
            for (const job of jobs) {
                const payload = buildPayload({
                    ...form,
                    name: ruleNameFor(job.metricType, job.nodeId, jobs.length),
                    nodeId: job.nodeId,
                    metricType: job.metricType,
                });
                const res = await authFetch('/api/notification-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res?.ok) {
                    const fallback = savedRules.length > 0
                        ? `${jobs.length}개 중 ${savedRules.length}개만 저장했습니다.`
                        : '알림 규칙 저장에 실패했습니다.';
                    if (res) showToast('danger', await readApiErrorMessage(res, fallback));
                    return;
                }
                savedRules.push(await res.json());
            }

            setRules(prev => [...savedRules.slice().reverse(), ...prev]);
            showToast('success', `${savedRules.length}개 알림 규칙을 추가했습니다.`);
        } catch {
            showToast('danger', '알림 규칙 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const deleteRule = async (rule) => {
        setDeletingId(rule.id);
        try {
            const res = await authFetch(`/api/notification-rules/${rule.id}`, { method: 'DELETE' });
            if (res?.ok || res?.status === 204) {
                setRules(prev => prev.filter(item => item.id !== rule.id));
                if (form.id === rule.id) resetForm();
                showToast('success', '알림 규칙을 삭제했습니다.');
            } else if (res) {
                showToast('danger', await readApiErrorMessage(res, '알림 규칙 삭제에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '알림 규칙 삭제에 실패했습니다.');
        } finally {
            setDeletingId(null);
        }
    };

    const toggleRule = async (rule) => {
        if (!rule) return;
        const nextRule = { ...rule, enabled: !rule.enabled };
        try {
            const res = await authFetch(`/api/notification-rules/${rule.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload({
                    ...nextRule,
                    nodeId: nextRule.nodeId ? String(nextRule.nodeId) : '',
                })),
            });
            if (res?.ok) {
                const saved = await res.json();
                setRules(prev => prev.map(item => item.id === saved.id ? saved : item));
                if (form.id === saved.id) {
                    selectRule(saved);
                }
            } else if (res) {
                showToast('danger', await readApiErrorMessage(res, '상태 변경에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '상태 변경에 실패했습니다.');
        }
    };

    return (
        <div className="notification-rules-grid">
                <section className="main-panel notification-rules-list-panel">
                    <div className="main-panel-header">
                        <div>
                            <h5 className="text-info mb-0">규칙 목록</h5>
                            <small className="text-secondary">{rules.length}개</small>
                        </div>
                        <button type="button" className="btn btn-outline-info btn-sm" onClick={resetForm}>
                            <i className="bi bi-plus-lg me-1"></i>새 규칙
                        </button>
                    </div>
                    <div className="main-panel-body">
                        {loading ? (
                            <div className="notification-rule-empty">불러오는 중...</div>
                        ) : rules.length === 0 ? (
                            <div className="notification-rule-empty">등록된 알림 규칙이 없습니다.</div>
                        ) : (
                            <div className="notification-rule-list">
                                {rules.map(rule => (
                                    <button
                                        type="button"
                                        key={rule.id}
                                        className={`notification-rule-item ${form.id === rule.id ? 'notification-rule-item-active' : ''}`}
                                        onClick={() => selectRule(rule)}
                                    >
                                        <span className={`notification-rule-status ${rule.enabled ? 'notification-rule-status-on' : ''}`}></span>
                                        <span className="notification-rule-copy">
                                            <span className="notification-rule-name">{rule.name}</span>
                                            <span className="notification-rule-meta">
                                                {rule.nodeName || '전체 내 노드'} · {metricLabel(rule.metricType)} · {Number(rule.thresholdPercent).toFixed(0)}% 이상
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section className="main-panel notification-rules-detail-panel">
                    <form onSubmit={saveRule} className="main-panel-body notification-rule-form">
                        <div className="notification-rule-form-head">
                            <div>
                                <h5 className="text-info mb-0">상세 설정</h5>
                                <small className="text-secondary">{editing ? '선택한 규칙 수정' : `${batchCreateCount}개 규칙 생성`}</small>
                            </div>
                            <div className="form-check form-switch">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    role="switch"
                                    checked={form.enabled}
                                    onChange={event => updateForm('enabled', event.target.checked)}
                                    id="notification-rule-enabled"
                                />
                                <label className="form-check-label text-secondary" htmlFor="notification-rule-enabled">활성</label>
                            </div>
                        </div>

                        <label className="notification-rule-field">
                            <span>{editing ? '규칙 이름' : '기본 이름'}</span>
                            <input
                                className="form-control"
                                value={form.name}
                                maxLength={120}
                                onChange={event => updateForm('name', event.target.value)}
                                onKeyDown={submitOnEnter}
                                placeholder={`${selectedMetric.label} ${form.thresholdPercent}% 이상`}
                            />
                        </label>

                        <div className="notification-rule-field">
                            <span>대상 노드</span>
                            <div className="notification-rule-segment">
                                <button
                                    type="button"
                                    className={form.nodeMode !== 'SPECIFIC' ? 'notification-rule-segment-active' : ''}
                                    onClick={() => setTargetMode('ALL')}
                                    disabled={editing}
                                >
                                    전체 내 노드
                                </button>
                                <button
                                    type="button"
                                    className={form.nodeMode === 'SPECIFIC' ? 'notification-rule-segment-active' : ''}
                                    onClick={() => setTargetMode('SPECIFIC')}
                                    disabled={editing && !form.nodeId}
                                >
                                    특정 노드
                                </button>
                            </div>
                            {form.nodeMode === 'SPECIFIC' && (
                                <div className="notification-rule-node-picker">
                                    {!editing && (
                                        <div className="notification-rule-node-tools">
                                            <span>{selectedNodeValues.length}개 선택</span>
                                            <div>
                                                <button type="button" onClick={selectAllNodes}>전체 선택</button>
                                                <button type="button" onClick={clearNodeSelection}>해제</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="notification-rule-node-list">
                                        {ownedNodes.map(node => {
                                            const checked = selectedNodeValues.includes(String(node.id));
                                            return (
                                                <label
                                                    key={node.id}
                                                    className={`notification-rule-node-option ${checked ? 'notification-rule-node-option-active' : ''}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        disabled={editing}
                                                        onChange={() => toggleNode(node.id)}
                                                    />
                                                    <span>{node.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="notification-rule-metric-picker">
                            {METRIC_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`notification-rule-metric ${selectedMetricValues.includes(option.value) ? 'notification-rule-metric-active' : ''}`}
                                    onClick={() => toggleMetric(option.value)}
                                >
                                    <i className={`bi ${option.icon}`}></i>
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="notification-rule-two-col">
                            <label className="notification-rule-field">
                                <span>임계값</span>
                                <input
                                    className="form-control"
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="1"
                                    value={form.thresholdPercent}
                                    onChange={event => updateForm('thresholdPercent', event.target.value)}
                                />
                            </label>
                            <label className="notification-rule-field">
                                <span>지속 시간</span>
                                <input
                                    className="form-control"
                                    type="number"
                                    min="0"
                                    max="3600"
                                    step="10"
                                    value={form.durationSeconds}
                                    onChange={event => updateForm('durationSeconds', event.target.value)}
                                />
                            </label>
                        </div>

                        <div className="notification-rule-field">
                            <span>재알림 간격</span>
                            <div className="notification-rule-time-grid">
                                <label className="notification-rule-time-input">
                                    <input
                                        type="number"
                                        min="0"
                                        max="24"
                                        value={cooldownParts.hours}
                                        onChange={event => updateCooldownPart('hours', event.target.value)}
                                    />
                                    <span>시</span>
                                </label>
                                <label className="notification-rule-time-input">
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        value={cooldownParts.minutes}
                                        onChange={event => updateCooldownPart('minutes', event.target.value)}
                                    />
                                    <span>분</span>
                                </label>
                                <label className="notification-rule-time-input">
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        value={cooldownParts.seconds}
                                        onChange={event => updateCooldownPart('seconds', event.target.value)}
                                    />
                                    <span>초</span>
                                </label>
                            </div>
                            <div className="notification-rule-time-presets">
                                {COOLDOWN_PRESETS.map(preset => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        className={Number(form.cooldownSeconds) === preset.value ? 'notification-rule-time-preset-active' : ''}
                                        onClick={() => updateForm('cooldownSeconds', preset.value)}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="notification-rule-summary">
                            <span>{form.nodeMode === 'SPECIFIC' ? `특정 노드 ${selectedNodeValues.length}개` : `전체 내 노드 ${ownedNodes.length}개`}</span>
                            <strong>{selectedMetricValues.map(metricLabel).join(', ')} {Number(form.thresholdPercent || 0).toFixed(0)}% 이상</strong>
                            <span>{formatSeconds(form.durationSeconds)} 지속 · {formatSeconds(form.cooldownSeconds)}마다 재알림</span>
                        </div>

                        <div className="notification-rule-actions">
                            {editing && (
                                <>
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => toggleRule(rules.find(rule => rule.id === form.id))}>
                                        {form.enabled ? '비활성화' : '활성화'}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        disabled={deletingId === form.id}
                                        onClick={() => {
                                            const selectedRule = rules.find(rule => rule.id === form.id);
                                            if (selectedRule) deleteRule(selectedRule);
                                        }}
                                    >
                                        {deletingId === form.id ? '삭제 중...' : '삭제'}
                                    </button>
                                </>
                            )}
                            <button type="submit" className="btn btn-info btn-sm text-light" disabled={saving}>
                                {saving ? '저장 중...' : editing ? '저장' : `${batchCreateCount}개 저장`}
                            </button>
                        </div>
                    </form>
                </section>
        </div>
    );
}

function NotificationRules() {
    useAppHeader(HEADER);

    return (
        <main className="main-page notification-rules-page flex-grow-1 overflow-y-auto p-2 p-md-3">
            <NotificationRulesContent />
        </main>
    );
}

export default NotificationRules;
