import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppHeader } from '../hooks/useAppHeader';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useToast } from '../context/ToastContext';
import { readApiErrorMessage } from '../utils/apiErrorMessage';

const HEADER = { title: '알림 규칙' };

const METRIC_OPTIONS = [
    { value: 'CPU_USAGE', label: 'CPU 사용률', icon: 'bi-cpu' },
    { value: 'MEMORY_USAGE', label: '메모리 사용률', icon: 'bi-memory' },
    { value: 'DISK_USAGE', label: '디스크 사용률', icon: 'bi-hdd' },
];

const SEVERITY_OPTIONS = [
    { value: 'warning', label: '주의' },
    { value: 'danger', label: '위험' },
    { value: 'info', label: '정보' },
];

const DEFAULT_FORM = {
    id: null,
    name: '',
    nodeId: '',
    metricType: 'CPU_USAGE',
    severity: 'warning',
    thresholdPercent: 80,
    durationSeconds: 60,
    cooldownSeconds: 300,
    enabled: true,
};

const metricLabel = (metricType) => (
    METRIC_OPTIONS.find(option => option.value === metricType)?.label || metricType
);

const severityClass = (severity) => {
    if (severity === 'danger') return 'text-danger';
    if (severity === 'info') return 'text-info';
    return 'text-warning';
};

const formatSeconds = (seconds) => {
    const value = Number(seconds) || 0;
    if (value >= 3600) return `${Math.round(value / 3600)}시간`;
    if (value >= 60) return `${Math.round(value / 60)}분`;
    return `${value}초`;
};

function NotificationRules() {
    const authFetch = useAuthFetch();
    const { showToast } = useToast();
    const [rules, setRules] = useState([]);
    const [nodes, setNodes] = useState([]);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    useAppHeader(HEADER);

    const ownedNodes = useMemo(() => nodes.filter(node => node.owner), [nodes]);
    const selectedMetric = METRIC_OPTIONS.find(option => option.value === form.metricType) || METRIC_OPTIONS[0];
    const editing = Boolean(form.id);

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
            metricType: rule.metricType || 'CPU_USAGE',
            severity: rule.severity || 'warning',
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
        severity: source.severity,
        thresholdPercent: Number(source.thresholdPercent),
        durationSeconds: Number(source.durationSeconds),
        cooldownSeconds: Number(source.cooldownSeconds),
        enabled: Boolean(source.enabled),
    });

    const saveRule = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const res = await authFetch(editing ? `/api/notification-rules/${form.id}` : '/api/notification-rules', {
                method: editing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload()),
            });
            if (res?.ok) {
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
                    metricType: saved.metricType,
                    severity: saved.severity,
                    thresholdPercent: Number(saved.thresholdPercent),
                    durationSeconds: Number(saved.durationSeconds),
                    cooldownSeconds: Number(saved.cooldownSeconds),
                    enabled: saved.enabled !== false,
                });
                showToast('success', editing ? '알림 규칙을 저장했습니다.' : '알림 규칙을 추가했습니다.');
            } else if (res) {
                showToast('danger', await readApiErrorMessage(res, '알림 규칙 저장에 실패했습니다.'));
            }
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
        <main className="main-page notification-rules-page flex-grow-1 overflow-y-auto p-2 p-md-3">
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
                                        <span className={`notification-rule-severity ${severityClass(rule.severity)}`}>
                                            {SEVERITY_OPTIONS.find(option => option.value === rule.severity)?.label || rule.severity}
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
                                <small className="text-secondary">{editing ? '선택한 규칙 수정' : '새 규칙 추가'}</small>
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
                            <span>규칙 이름</span>
                            <input
                                className="form-control"
                                value={form.name}
                                maxLength={120}
                                onChange={event => updateForm('name', event.target.value)}
                                placeholder={`${selectedMetric.label} ${form.thresholdPercent}% 이상`}
                            />
                        </label>

                        <div className="notification-rule-two-col">
                            <label className="notification-rule-field">
                                <span>대상 노드</span>
                                <select
                                    className="form-control"
                                    value={form.nodeId}
                                    onChange={event => updateForm('nodeId', event.target.value)}
                                >
                                    <option value="">전체 내 노드</option>
                                    {nodes.map(node => (
                                        <option key={node.id} value={node.id}>
                                            {node.name}{node.owner ? '' : ' (팀 노드)'}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="notification-rule-field">
                                <span>알림 등급</span>
                                <select
                                    className="form-control"
                                    value={form.severity}
                                    onChange={event => updateForm('severity', event.target.value)}
                                >
                                    {SEVERITY_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="notification-rule-metric-picker">
                            {METRIC_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`notification-rule-metric ${form.metricType === option.value ? 'notification-rule-metric-active' : ''}`}
                                    onClick={() => updateForm('metricType', option.value)}
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

                        <label className="notification-rule-field">
                            <span>재알림 간격</span>
                            <input
                                className="form-control"
                                type="number"
                                min="30"
                                max="86400"
                                step="30"
                                value={form.cooldownSeconds}
                                onChange={event => updateForm('cooldownSeconds', event.target.value)}
                            />
                        </label>

                        <div className="notification-rule-summary">
                            <span>{form.nodeId ? nodes.find(node => String(node.id) === String(form.nodeId))?.name : `전체 내 노드 ${ownedNodes.length}개`}</span>
                            <strong>{selectedMetric.label} {Number(form.thresholdPercent || 0).toFixed(0)}% 이상</strong>
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
                            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resetForm}>초기화</button>
                            <button type="submit" className="btn btn-info btn-sm text-light" disabled={saving}>
                                {saving ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </form>
                </section>
            </div>
        </main>
    );
}

export default NotificationRules;
