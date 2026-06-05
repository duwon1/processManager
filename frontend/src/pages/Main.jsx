import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppHeader } from '../hooks/useAppHeader';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { readJwtSubject } from '../utils/authToken';
import { getNodeStatusMeta } from '../utils/nodeStatus';

const INSTALL_TARGETS = {
    linux: {
        label: 'Linux',
        icon: 'bi-terminal',
        available: true,
        buildCommand: ({ serverUrl, installCurlHeader, installToken, agentInstance }) =>
            `curl -sSL${installCurlHeader} ${serverUrl}/agent/install.sh | sudo bash -s -- --server ${serverUrl} --token ${installToken} --instance ${agentInstance}`,
    },
    windows: {
        label: 'Windows',
        icon: 'bi-windows',
        available: true,
        instructionText: 'PowerShell을 관리자 권한으로 실행한 뒤 붙여넣어 실행하세요.',
        buildCommand: ({ serverUrl, installToken, agentInstance, installPowerShellHeader }) =>
            `$p=Join-Path $env:TEMP 'processmanager-install.ps1'; Invoke-WebRequest -Uri '${serverUrl}/agent/install.ps1'${installPowerShellHeader} -OutFile $p; powershell -NoProfile -ExecutionPolicy Bypass -File $p -Server '${serverUrl}' -Token '${installToken}' -Instance '${agentInstance}'`,
    },
    macos: {
        label: 'macOS',
        icon: 'bi-apple',
        available: false,
        unavailableText: '현재 선택할 수 없는 OS입니다.',
    },
};

const INSTALL_TARGET_KEYS = Object.keys(INSTALL_TARGETS);
const PROFILE_HEADER = { title: '프로필' };

const resolveServerUrl = () => {
    const configuredUrl = import.meta.env.VITE_SERVER_URL;
    if (configuredUrl) return configuredUrl.replace(/\/$/, '');

    const isLocalDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (import.meta.env.DEV && isLocalDevHost) {
        return 'http://localhost:8080';
    }

    return window.location.origin;
};

function Main() {
    const [installToken, setInstallToken] = useState('');
    const [installTokenExpiresAt, setInstallTokenExpiresAt] = useState('');
    const [installTokenRemainingExtensions, setInstallTokenRemainingExtensions] = useState(0);
    const [installTargetKey, setInstallTargetKey] = useState('');
    const [nowMs, setNowMs] = useState(() => Date.now());

    const { showToast } = useToast();
    const dialog = useDialog();
    const authFetch = useAuthFetch();
    const { nodes, teams, profile, refreshNodes } = useAppData();
    const { accessToken } = useAuth();
    const navigate = useNavigate();

    useAppHeader(PROFILE_HEADER);

    const email = useMemo(() => {
        return readJwtSubject(accessToken);
    }, [accessToken]);

    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || '사용자';
    const ownedNodeCount = nodes.filter(node => node.owner).length;
    const teamNodeCount = nodes.length - ownedNodeCount;

    useEffect(() => {
        if (!installTokenExpiresAt) return undefined;
        const intervalId = setInterval(() => setNowMs(Date.now()), 1000);
        const expiresAtMs = new Date(installTokenExpiresAt).getTime();
        const timeoutId = setTimeout(() => {
            setInstallToken('');
            setInstallTokenExpiresAt('');
            setInstallTokenRemainingExtensions(0);
            setNowMs(Date.now());
        }, Number.isNaN(expiresAtMs) ? 0 : Math.max(0, expiresAtMs - Date.now()));
        return () => {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
        };
    }, [installTokenExpiresAt]);

    const createInstallToken = async () => {
        if (!selectedInstallTarget?.available) {
            showToast('warning', '설치할 OS를 먼저 선택하세요.');
            return;
        }
        if (hasActiveInstallCommand) {
            showToast('info', '이미 유효한 설치 명령어가 있습니다.');
            return;
        }

        const confirmed = await dialog.confirm({
            title: '설치 명령어 생성',
            message: `${selectedInstallTarget.label} 설치 명령어를 생성할까요?`,
            detail: '생성된 설치 명령어는 5분 동안 유효하고, 한 번 사용하면 다시 사용할 수 없습니다. 기존 미사용 명령어는 폐기됩니다.',
            icon: 'bi-arrow-clockwise',
            confirmLabel: '생성',
            confirmVariant: 'warning',
        });
        if (!confirmed) return;

        authFetch('/api/user/install-token', { method: 'POST' })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => {
                applyInstallTokenResponse(data);
                showToast('success', '설치 명령어를 생성했습니다.');
            })
            .catch(() => showToast('danger', '설치 명령어 생성에 실패했습니다.'));
    };

    const extendInstallToken = async () => {
        if (!installToken || installTokenRemainingExtensions <= 0) return;

        authFetch('/api/user/install-token/extend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installToken }),
        })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => {
                applyInstallTokenResponse(data, installToken);
                showToast('success', '설치 명령어 유효 시간이 5분으로 갱신됐습니다.');
            })
            .catch(() => showToast('danger', '설치 명령어 연장에 실패했습니다.'));
    };

    const applyInstallTokenResponse = (data, fallbackToken = '') => {
        const expiresInSeconds = Number(data?.expiresInSeconds);
        const safeExpiresInSeconds = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
            ? expiresInSeconds
            : 300;
        setInstallToken(data?.installToken || fallbackToken);
        setInstallTokenExpiresAt(new Date(Date.now() + safeExpiresInSeconds * 1000).toISOString());
        setInstallTokenRemainingExtensions(data?.remainingExtensions ?? 0);
        setNowMs(Date.now());
    };

    const copyToClipboard = async (text) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('success', '클립보드에 복사했습니다.');
        } catch {
            showToast('danger', '복사에 실패했습니다.');
        }
    };

    const serverUrl = resolveServerUrl();
    const agentInstance = import.meta.env.VITE_AGENT_INSTANCE
        || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'dev' : 'prod');
    const installCurlHeader = serverUrl.includes('ngrok-free.dev') || serverUrl.includes('ngrok-free.app') || serverUrl.includes('ngrok.io')
        ? ' -H "ngrok-skip-browser-warning: true"'
        : '';
    const installPowerShellHeader = installCurlHeader
        ? " -Headers @{'ngrok-skip-browser-warning'='true'}"
        : '';
    const selectedInstallTarget = INSTALL_TARGETS[installTargetKey] || null;
    const formatRemainingTime = (seconds) => {
        const safeSeconds = Math.max(0, seconds);
        const minutes = Math.floor(safeSeconds / 60);
        const restSeconds = safeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
    };
    const installTokenExpiresAtMs = installTokenExpiresAt ? new Date(installTokenExpiresAt).getTime() : Number.NaN;
    const installTokenRemainingSeconds = Number.isNaN(installTokenExpiresAtMs)
        ? 0
        : Math.min(300, Math.max(0, Math.ceil((installTokenExpiresAtMs - nowMs) / 1000)));
    const installTokenRemainingText = installTokenRemainingSeconds > 0
        ? formatRemainingTime(installTokenRemainingSeconds)
        : '만료됨';
    const hasActiveInstallCommand = Boolean(installToken) && installTokenRemainingSeconds > 0;
    const canExtendInstallToken = Boolean(installToken) && installTokenRemainingExtensions > 0 && installTokenRemainingSeconds > 0;
    const installCommand = hasActiveInstallCommand && selectedInstallTarget?.available
        ? selectedInstallTarget.buildCommand({ serverUrl, installCurlHeader, installPowerShellHeader, installToken, agentInstance })
        : '';
    const installCommandPlaceholder = !selectedInstallTarget
        ? '설치할 OS를 선택하면 설치 명령어를 생성할 수 있습니다.'
        : !selectedInstallTarget.available
            ? selectedInstallTarget.unavailableText || '현재 선택할 수 없는 OS입니다.'
            : hasActiveInstallCommand
            ? ''
            : `${selectedInstallTarget.label} 설치 명령어를 생성하면 여기에 표시됩니다.`;

    const handleDeleteNode = async (node) => {
        const confirmed = await dialog.confirm({
            title: '노드 삭제',
            message: `"${node.name}" 노드를 삭제할까요?`,
            detail: '삭제 요청 후 에이전트 언인스톨 처리가 진행됩니다.',
            icon: 'bi-hdd-network',
            confirmLabel: '삭제',
            confirmVariant: 'danger',
        });
        if (!confirmed) return;

        authFetch(`/api/node/${node.id}`, { method: 'DELETE' })
            .then(res => {
                if (res?.ok) {
                    refreshNodes();
                    showToast('success', `'${node.name}' 노드 삭제를 요청했습니다.`);
                } else {
                    showToast('danger', '노드 삭제에 실패했습니다.');
                }
            })
            .catch(() => showToast('danger', '노드 삭제에 실패했습니다.'));
    };

    return (
                    <main className="main-page flex-grow-1 overflow-y-auto p-2 p-md-3">
                        <div className="main-overview-grid mb-3">
                            <section className="main-panel profile-panel">
                                <div className="main-panel-header">
                                    <h5 className="text-info mb-0">내 프로필</h5>
                                </div>
                                <div className="main-panel-body">
                                    <div className="profile-identity">
                                        {profile?.picture ? (
                                            <img
                                                src={profile.picture}
                                                alt="프로필"
                                                className="profile-avatar"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="profile-avatar profile-avatar-fallback">
                                                {(displayName || 'U')[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div style={{ minWidth: 0 }}>
                                            <div className="text-light fw-semibold text-truncate">{displayName}</div>
                                            <small className="text-secondary text-truncate d-block">{displayEmail}</small>
                                        </div>
                                    </div>
                                    <div className="profile-stat-grid">
                                        <div className="profile-stat">
                                            <span>내 노드</span>
                                            <strong>{ownedNodeCount}</strong>
                                        </div>
                                        <div className="profile-stat profile-stat-team">
                                            <span>팀 노드</span>
                                            <strong>{teamNodeCount}</strong>
                                        </div>
                                        <div className="profile-stat profile-stat-member">
                                            <span>소속 팀</span>
                                            <strong>{teams.length}</strong>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section className="main-panel install-panel">
                                <div className="main-panel-header">
                                    <h5 className="text-info mb-0">에이전트 설치</h5>
                                </div>
                                <div className="main-panel-body">
                                <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3 mb-4">
                                    <div>
                                        <div className="text-secondary small mb-2">
                                            설치할 OS를 먼저 선택한 뒤 설치 명령어를 생성하세요.
                                        </div>
                                        <div className="d-flex flex-wrap gap-2" role="group" aria-label="설치 OS 선택">
                                            {INSTALL_TARGET_KEYS.map(key => {
                                                const target = INSTALL_TARGETS[key];
                                                const selected = key === installTargetKey;
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        className={`btn btn-sm ${selected ? 'btn-info text-light' : 'btn-outline-secondary'}`}
                                                        onClick={() => setInstallTargetKey(key)}
                                                        aria-pressed={selected}
                                                    >
                                                        <i className={`bi ${target.icon} me-1`}></i>{target.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary btn-sm flex-shrink-0"
                                            onClick={createInstallToken}
                                            disabled={!selectedInstallTarget?.available || hasActiveInstallCommand}
                                            title={!selectedInstallTarget ? '설치할 OS를 먼저 선택하세요.' : !selectedInstallTarget.available ? '현재 선택할 수 없는 OS입니다.' : hasActiveInstallCommand ? '이미 유효한 설치 명령어가 있습니다.' : '설치 명령어 생성'}
                                        >
                                            <i className={`bi ${hasActiveInstallCommand ? 'bi-check2-circle' : 'bi-terminal-plus'} me-1`}></i>
                                            {hasActiveInstallCommand ? `남은 시간 ${installTokenRemainingText}` : '설치 명령어 생성'}
                                        </button>
                                        <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={extendInstallToken} disabled={!canExtendInstallToken}>
                                            <i className="bi bi-clock-history me-1"></i>5분 연장
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded border border-secondary border-opacity-50 bg-dark bg-opacity-25 text-secondary small px-3 py-2 mb-3">
                                    설치 명령어는 만료 전까지 실행할 수 있지만, 보안을 위해 새로고침하면 이 화면에서는 다시 표시되지 않습니다. 새로 생성하면 이전 미사용 명령어는 폐기됩니다.
                                </div>
                                {selectedInstallTarget?.instructionText && (
                                    <div className="rounded border border-secondary border-opacity-50 bg-black bg-opacity-25 text-light small px-3 py-2 mb-3">
                                        <i className={`bi ${selectedInstallTarget.icon} me-1`}></i>
                                        {selectedInstallTarget.instructionText}
                                    </div>
                                )}
                                <label className="text-secondary small mb-2 d-block">
                                    설치 명령어{selectedInstallTarget ? ` (${selectedInstallTarget.label})` : ''}
                                </label>
                                <div className="d-flex align-items-start gap-2 mb-0">
                                    <code className="flex-grow-1 bg-black text-info p-2 rounded small" style={{ wordBreak: 'break-all', lineHeight: 1.25 }}>
                                        {installCommand || installCommandPlaceholder}
                                    </code>
                                    <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(installCommand)} disabled={!installCommand}>
                                        <i className="bi bi-copy me-1"></i>복사
                                    </button>
                                </div>
                            </div>
                            </section>
                        </div>

                        <section className="main-section">
                            <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                                <h5 className="text-info mb-0">접근 가능한 노드</h5>
                                <span className="badge text-bg-secondary">{nodes.length}개</span>
                            </div>
                            {nodes.length === 0 ? (
                                <p className="text-muted fst-italic">에이전트를 설치하면 노드가 자동으로 등록됩니다.</p>
                            ) : (
                                <div className="row g-3">
                                    {[...nodes].sort((a, b) => getNodeStatusMeta(a.status).rank - getNodeStatusMeta(b.status).rank).map(node => {
                                        const statusMeta = getNodeStatusMeta(node.status);
                                        const isDeletePending = node.status === 'D';
                                        const sharedTeamNames = typeof node.sharedTeamNames === 'string' ? node.sharedTeamNames.trim() : '';
                                        return (
                                            <div key={node.id} className="col-12 col-sm-6 col-lg-4 col-xxl-3">
                                                <div
                                                    className={`node-tile node-tile-status-${node.status} position-relative ${isDeletePending ? 'node-tile-pending' : ''}`}
                                                    style={{ height: '104px', cursor: isDeletePending ? 'default' : 'pointer' }}
                                                    onClick={() => { if (!isDeletePending) navigate(`/dashboard/${node.id}`); }}
                                                >
                                                    <div className="node-tile-body">
                                                        <div className="d-flex align-items-center gap-2 mb-1">
                                                            <span className={`rounded-circle ${statusMeta.dotClass}`} style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                                                            <h6 className="m-0 text-light text-truncate pe-3">{node.name}</h6>
                                                        </div>
                                                        <small className="text-secondary d-block text-truncate">{node.osType}</small>
                                                        <div className="node-tile-meta mt-1">
                                                            <span className="node-tile-meta-main">
                                                                <small className={`fw-semibold ${statusMeta.textClass}`}>{statusMeta.label}</small>
                                                                <span className={`badge ${node.owner ? 'text-bg-primary' : 'text-bg-info'}`}>
                                                                    {node.owner ? '내 노드' : '팀 노드'}
                                                                </span>
                                                            </span>
                                                            {!node.owner && sharedTeamNames && (
                                                                <small className="node-tile-shared-teams text-info" title={sharedTeamNames}>
                                                                    <i className="bi bi-people me-1"></i>{sharedTeamNames}
                                                                </small>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {node.owner && (
                                                        <button
                                                            type="button"
                                                            className={`btn btn-link p-0 position-absolute ${isDeletePending ? 'text-secondary' : 'text-danger'}`}
                                                            style={{ top: '6px', right: '8px', fontSize: '0.85rem', lineHeight: 1 }}
                                                            disabled={isDeletePending}
                                                            onClick={(e) => { e.stopPropagation(); if (!isDeletePending) handleDeleteNode(node); }}
                                                            aria-label="노드 삭제"
                                                        >
                                                            <i className="bi bi-x-lg"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </main>
    );
}

export default Main;
