import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideBar from '../components/SideBar';
import Header from '../components/Header';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { readJwtSubject } from '../utils/authToken';
import { getNodeStatusMeta } from '../utils/nodeStatus';

function Main() {
    const [nodes, setNodes] = useState([]);
    const [teams, setTeams] = useState([]);
    const [profile, setProfile] = useState(null);
    const [installToken, setInstallToken] = useState('');
    const [installTokenExpiresAt, setInstallTokenExpiresAt] = useState('');
    const [installTokenRemainingExtensions, setInstallTokenRemainingExtensions] = useState(0);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const { showToast } = useToast();
    const dialog = useDialog();
    const authFetch = useAuthFetch();
    const { accessToken } = useAuth();
    const navigate = useNavigate();

    const email = useMemo(() => {
        return readJwtSubject(accessToken);
    }, [accessToken]);

    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || '사용자';
    const ownedNodeCount = nodes.filter(node => node.owner).length;
    const teamNodeCount = nodes.length - ownedNodeCount;

    const fetchNodes = useCallback(() => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setNodes(Array.isArray(data) ? data : []))
            .catch(() => setNodes([]));
    }, [authFetch]);

    const fetchTeams = useCallback(() => {
        authFetch('/api/team/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setTeams(Array.isArray(data) ? data : []))
            .catch(() => setTeams([]));
    }, [authFetch]);

    const fetchProfile = useCallback(() => {
        authFetch('/api/user/me')
            .then(res => res && res.ok ? res.json() : null)
            .then(data => setProfile(data))
            .catch(() => setProfile(null));
    }, [authFetch]);

    useEffect(() => {
        fetchNodes();
        fetchTeams();
        fetchProfile();
        const intervalId = setInterval(() => {
            fetchNodes();
            fetchTeams();
        }, 5000);
        return () => clearInterval(intervalId);
    }, [fetchNodes, fetchTeams, fetchProfile]);

    useEffect(() => {
        if (!installTokenExpiresAt) return undefined;
        const intervalId = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(intervalId);
    }, [installTokenExpiresAt]);

    const createInstallToken = async () => {
        const confirmed = await dialog.confirm({
            title: '설치 토큰 생성',
            message: '1회용 설치 토큰을 생성할까요?',
            detail: '생성된 토큰은 5분 동안 유효하고, 한 번 사용하면 다시 사용할 수 없습니다. 기존 미사용 토큰은 폐기됩니다.',
            icon: 'bi-arrow-clockwise',
            confirmLabel: '생성',
            confirmVariant: 'warning',
        });
        if (!confirmed) return;

        authFetch('/api/user/install-token', { method: 'POST' })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => {
                setInstallToken(data.installToken || '');
                setInstallTokenExpiresAt(data.expiresAt || '');
                setInstallTokenRemainingExtensions(data.remainingExtensions ?? 0);
                showToast('success', '1회용 설치 토큰을 생성했습니다.');
            })
            .catch(() => showToast('danger', '설치 토큰 생성에 실패했습니다.'));
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
                setInstallToken(data.installToken || installToken);
                setInstallTokenExpiresAt(data.expiresAt || '');
                setInstallTokenRemainingExtensions(data.remainingExtensions ?? 0);
                showToast('success', '설치 토큰 시간이 5분으로 갱신됐습니다.');
            })
            .catch(() => showToast('danger', '설치 토큰 연장에 실패했습니다.'));
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

    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    const agentInstance = import.meta.env.VITE_AGENT_INSTANCE
        || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'dev' : 'prod');
    const installCurlHeader = serverUrl.includes('ngrok-free.dev') || serverUrl.includes('ngrok-free.app') || serverUrl.includes('ngrok.io')
        ? ' -H "ngrok-skip-browser-warning: true"'
        : '';
    const installCommand = installToken
        ? `curl -sSL${installCurlHeader} ${serverUrl}/agent/install.sh | sudo bash -s -- --server ${serverUrl} --token ${installToken} --instance ${agentInstance}`
        : '';
    const formatRemainingTime = (seconds) => {
        const safeSeconds = Math.max(0, seconds);
        const minutes = Math.floor(safeSeconds / 60);
        const restSeconds = safeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
    };
    const installTokenExpiresAtMs = installTokenExpiresAt ? new Date(installTokenExpiresAt).getTime() : Number.NaN;
    const installTokenRemainingSeconds = Number.isNaN(installTokenExpiresAtMs)
        ? 0
        : Math.max(0, Math.ceil((installTokenExpiresAtMs - nowMs) / 1000));
    const installTokenRemainingText = installTokenRemainingSeconds > 0
        ? formatRemainingTime(installTokenRemainingSeconds)
        : '만료됨';
    const canExtendInstallToken = Boolean(installToken) && installTokenRemainingExtensions > 0 && installTokenRemainingSeconds > 0;

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
                    fetchNodes();
                    showToast('success', `'${node.name}' 노드 삭제를 요청했습니다.`);
                } else {
                    showToast('danger', '노드 삭제에 실패했습니다.');
                }
            })
            .catch(() => showToast('danger', '노드 삭제에 실패했습니다.'));
    };

    return (
        <>
            <div className="d-flex vh-100 overflow-hidden">
                <SideBar />

                <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                    <Header title="프로필" />

                    <main className="flex-grow-1 overflow-y-auto p-2 p-md-4">
                        <h5 className="text-info mb-4">내 프로필</h5>
                        <div className="card bg-dark border-secondary mb-4">
                            <div className="card-body">
                                <div className="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom border-secondary">
                                    {profile?.picture ? (
                                        <img
                                            src={profile.picture}
                                            alt="프로필"
                                            className="rounded-circle flex-shrink-0"
                                            style={{ width: '64px', height: '64px', objectFit: 'cover' }}
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div
                                            className="rounded-circle bg-info bg-opacity-75 d-flex align-items-center justify-content-center text-dark fw-bold flex-shrink-0"
                                            style={{ width: '64px', height: '64px', fontSize: '1.4rem' }}
                                        >
                                            {(displayName || 'U')[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div style={{ minWidth: 0 }}>
                                        <div className="text-light fw-semibold text-truncate">{displayName}</div>
                                        <small className="text-secondary text-truncate d-block">{displayEmail}</small>
                                    </div>
                                </div>
                                <div className="row py-2 border-bottom border-secondary">
                                    <div className="col-4 col-md-3 text-secondary">이메일</div>
                                    <div className="col-8 col-md-9 text-light text-break">{displayEmail}</div>
                                </div>
                                <div className="row py-2 border-bottom border-secondary">
                                    <div className="col-4 col-md-3 text-secondary">내 노드</div>
                                    <div className="col-8 col-md-9 text-light">{ownedNodeCount}개</div>
                                </div>
                                <div className="row py-2 border-bottom border-secondary">
                                    <div className="col-4 col-md-3 text-secondary">팀 노드</div>
                                    <div className="col-8 col-md-9 text-light">{teamNodeCount}개</div>
                                </div>
                                <div className="row py-2">
                                    <div className="col-4 col-md-3 text-secondary">소속 팀</div>
                                    <div className="col-8 col-md-9 text-light">{teams.length}개</div>
                                </div>
                            </div>
                        </div>

                        <h5 className="text-info mb-3">에이전트 설치 토큰</h5>
                        <div className="card bg-dark border-secondary mb-4">
                            <div className="card-body">
                                <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-3">
                                    <div className="text-secondary small">
                                        설치 토큰은 5분 동안 유효하며, 새 토큰을 만들면 기존 미사용 토큰은 폐기됩니다.
                                    </div>
                                    <div className="d-flex flex-wrap gap-2">
                                        <button type="button" className="btn btn-outline-warning btn-sm flex-shrink-0" onClick={createInstallToken}>
                                            <i className="bi bi-key me-1"></i>설치 토큰 생성
                                        </button>
                                        <button type="button" className="btn btn-outline-info btn-sm flex-shrink-0" onClick={extendInstallToken} disabled={!canExtendInstallToken}>
                                            <i className="bi bi-clock-history me-1"></i>5분 연장
                                        </button>
                                    </div>
                                </div>
                                <label className="text-secondary small mb-1 d-block">1회용 토큰</label>
                                <div className="d-flex align-items-start gap-2 mb-3">
                                    <code className="flex-grow-1 bg-black text-success p-2 rounded small" style={{ wordBreak: 'break-all' }}>
                                        {installToken || '설치 토큰을 생성하면 여기에 표시됩니다.'}
                                    </code>
                                    <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(installToken)} disabled={!installToken}>
                                        <i className="bi bi-copy me-1"></i>복사
                                    </button>
                                </div>
                                {installTokenExpiresAt && (
                                    <div className="text-warning small mb-3">
                                        남은 시간: {installTokenRemainingText} · 남은 연장 {installTokenRemainingExtensions}회
                                    </div>
                                )}
                                <label className="text-secondary small mb-1 d-block">설치 명령어</label>
                                <div className="d-flex align-items-start gap-2 mb-3">
                                    <code className="flex-grow-1 bg-black text-info p-2 rounded small" style={{ wordBreak: 'break-all' }}>
                                        {installCommand || '설치 토큰을 생성하면 설치 명령어가 표시됩니다.'}
                                    </code>
                                    <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(installCommand)} disabled={!installCommand}>
                                        <i className="bi bi-copy me-1"></i>복사
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
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
                                                    className={`card bg-dark position-relative ${isDeletePending ? 'border-warning' : 'border-secondary'}`}
                                                    style={{ height: node.owner || !sharedTeamNames ? '118px' : '136px', cursor: isDeletePending ? 'default' : 'pointer' }}
                                                    onClick={() => { if (!isDeletePending) navigate(`/dashboard/${node.id}`); }}
                                                >
                                                    <div className="card-body">
                                                        <div className="d-flex align-items-center gap-2 mb-2">
                                                            <span className={`rounded-circle ${statusMeta.dotClass}`} style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                                                            <h6 className="m-0 text-light text-truncate pe-3">{node.name}</h6>
                                                        </div>
                                                        <small className="text-secondary d-block text-truncate">{node.osType}</small>
                                                        <div className="d-flex align-items-center gap-2 mt-1">
                                                            <small className={`fw-semibold ${statusMeta.textClass}`}>{statusMeta.label}</small>
                                                            <span className={`badge ${node.owner ? 'text-bg-primary' : 'text-bg-info'}`}>
                                                                {node.owner ? '내 노드' : '팀 노드'}
                                                            </span>
                                                        </div>
                                                        {!node.owner && sharedTeamNames && (
                                                            <small className="text-info d-block text-truncate mt-2" title={sharedTeamNames}>
                                                                <i className="bi bi-people me-1"></i>공유팀: {sharedTeamNames}
                                                            </small>
                                                        )}
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
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}

export default Main;
