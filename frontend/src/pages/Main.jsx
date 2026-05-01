import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Main() {
    const [nodes, setNodes] = useState([]);
    const [teams, setTeams] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [profile, setProfile] = useState(null);
    const [accountToken, setAccountToken] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [nodeOptions, setNodeOptions] = useState([]);
    const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
    const [inviteEmail, setInviteEmail] = useState('');
    const [loadingTeamDetail, setLoadingTeamDetail] = useState(false);
    const [savingTeamNodes, setSavingTeamNodes] = useState(false);
    const [confirmNode, setConfirmNode] = useState(null);

    const { showToast } = useToast();
    const authFetch = useAuthFetch();
    const { accessToken } = useAuth();
    const navigate = useNavigate();

    const selectedTeam = useMemo(
        () => teams.find(team => team.id === selectedTeamId) || null,
        [teams, selectedTeamId]
    );

    const canManageSelectedTeam = selectedTeam && ['OWNER', 'ADMIN'].includes(selectedTeam.role);

    const email = useMemo(() => {
        if (!accessToken) return '';
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            return payload.sub ?? '';
        } catch {
            return '';
        }
    }, [accessToken]);

    const displayEmail = profile?.email || email;
    const displayName = profile?.name || displayEmail || '사용자';

    const getNodeStatusMeta = (status) => {
        if (status === 'Y') return { label: '온라인', dotClass: 'bg-success', textClass: 'text-success', rank: 0 };
        if (status === 'D') return { label: '삭제 대기', dotClass: 'bg-warning', textClass: 'text-warning', rank: 1 };
        return { label: '오프라인', dotClass: 'bg-danger', textClass: 'text-danger', rank: 2 };
    };

    const readErrorMessage = async (res, fallback) => {
        try {
            const data = await res.json();
            return data.message || fallback;
        } catch {
            return fallback;
        }
    };

    const fetchNodes = useCallback(() => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setNodes(Array.isArray(data) ? data : []))
            .catch(() => setNodes([]));
    }, [authFetch]);

    const fetchTeams = useCallback(() => {
        authFetch('/api/team/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => {
                const nextTeams = Array.isArray(data) ? data : [];
                setTeams(nextTeams);
                setSelectedTeamId(prev => {
                    if (prev && nextTeams.some(team => team.id === prev)) return prev;
                    return nextTeams[0]?.id ?? null;
                });
            })
            .catch(() => setTeams([]));
    }, [authFetch]);

    const fetchInvitations = useCallback(() => {
        authFetch('/api/team/invitations')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setInvitations(Array.isArray(data) ? data : []))
            .catch(() => setInvitations([]));
    }, [authFetch]);

    const fetchAccountToken = useCallback(() => {
        authFetch('/api/user/token')
            .then(res => res && res.ok ? res.json() : {})
            .then(data => setAccountToken(data.accountToken || ''))
            .catch(() => {});
    }, [authFetch]);

    const fetchProfile = useCallback(() => {
        authFetch('/api/user/me')
            .then(res => res && res.ok ? res.json() : null)
            .then(data => setProfile(data))
            .catch(() => setProfile(null));
    }, [authFetch]);

    const refreshTeamDetail = useCallback((teamId) => {
        if (!teamId) {
            setTeamMembers([]);
            setNodeOptions([]);
            setSelectedNodeIds(new Set());
            return;
        }

        setLoadingTeamDetail(true);
        Promise.all([
            authFetch(`/api/team/${teamId}/members`),
            authFetch(`/api/team/${teamId}/node-options`),
        ])
            .then(async ([membersRes, nodesRes]) => {
                const members = membersRes?.ok ? await membersRes.json() : [];
                const options = nodesRes?.ok ? await nodesRes.json() : [];
                setTeamMembers(Array.isArray(members) ? members : []);
                const nextOptions = Array.isArray(options) ? options : [];
                setNodeOptions(nextOptions);
                setSelectedNodeIds(new Set(nextOptions.filter(option => option.shared).map(option => option.nodeId)));
            })
            .catch(() => {
                setTeamMembers([]);
                setNodeOptions([]);
                setSelectedNodeIds(new Set());
            })
            .finally(() => setLoadingTeamDetail(false));
    }, [authFetch]);

    useEffect(() => {
        fetchNodes();
        fetchTeams();
        fetchInvitations();
        fetchProfile();
        fetchAccountToken();
        const intervalId = setInterval(fetchNodes, 5000);
        return () => clearInterval(intervalId);
    }, [fetchNodes, fetchTeams, fetchInvitations, fetchProfile, fetchAccountToken]);

    useEffect(() => {
        if (selectedTeamId && canManageSelectedTeam) {
            refreshTeamDetail(selectedTeamId);
        } else {
            setTeamMembers([]);
            setNodeOptions([]);
            setSelectedNodeIds(new Set());
        }
    }, [selectedTeamId, canManageSelectedTeam, refreshTeamDetail]);

    const reissueToken = () => {
        if (!confirm('설치용 토큰을 재발급할까요? 기존 에이전트는 계속 연결됩니다.')) return;
        authFetch('/api/user/token/reissue', { method: 'POST' })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => {
                setAccountToken(data.accountToken);
                showToast('success', '설치용 토큰을 재발급했습니다.');
            })
            .catch(() => showToast('danger', '토큰 재발급에 실패했습니다.'));
    };

    const copyToClipboard = async (text) => {
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
    const installCommand = accountToken
        ? `curl -sSL${installCurlHeader} ${serverUrl}/agent/install.sh | sudo bash -s -- --server ${serverUrl} --token ${accountToken} --instance ${agentInstance}`
        : '';

    const handleDeleteNode = () => {
        if (!confirmNode) return;
        const nodeName = confirmNode.name;
        setConfirmNode(null);
        authFetch(`/api/node/${confirmNode.id}`, { method: 'DELETE' })
            .then(res => {
                if (res?.ok) {
                    fetchNodes();
                    showToast('success', `'${nodeName}' 노드 삭제를 요청했습니다.`);
                } else {
                    showToast('danger', '노드 삭제에 실패했습니다.');
                }
            })
            .catch(() => showToast('danger', '노드 삭제에 실패했습니다.'));
    };

    const handleCreateTeam = async (e) => {
        e.preventDefault();
        const name = teamName.trim();
        const description = teamDescription.trim();
        if (!name) {
            showToast('warning', '팀 이름을 입력해주세요.');
            return;
        }

        setCreatingTeam(true);
        try {
            const res = await authFetch('/api/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description }),
            });
            if (res?.ok) {
                const created = await res.json();
                setTeamName('');
                setTeamDescription('');
                setSelectedTeamId(created.id);
                await fetchTeams();
                showToast('success', `'${created.name}' 팀을 만들었습니다.`);
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '팀 생성에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '팀 생성에 실패했습니다.');
        } finally {
            setCreatingTeam(false);
        }
    };

    const handleDeleteTeam = async (team) => {
        if (!confirm(`'${team.name}' 팀을 삭제할까요?`)) return;
        try {
            const res = await authFetch(`/api/team/${team.id}`, { method: 'DELETE' });
            if (res?.ok) {
                await fetchTeams();
                fetchNodes();
                showToast('success', `'${team.name}' 팀을 삭제했습니다.`);
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '팀 삭제에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '팀 삭제에 실패했습니다.');
        }
    };

    const handleInviteMember = async (e) => {
        e.preventDefault();
        if (!selectedTeam) return;
        const emailValue = inviteEmail.trim();
        if (!emailValue) {
            showToast('warning', '초대할 이메일을 입력해주세요.');
            return;
        }
        try {
            const res = await authFetch(`/api/team/${selectedTeam.id}/members/invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailValue }),
            });
            if (res?.ok) {
                setInviteEmail('');
                refreshTeamDetail(selectedTeam.id);
                showToast('success', '초대 요청을 처리했습니다.');
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '초대 요청에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '초대 요청에 실패했습니다.');
        }
    };

    const handleRemoveMember = async (member) => {
        if (!selectedTeam) return;
        if (!confirm(`${member.email} 사용자를 팀에서 제거할까요?`)) return;
        try {
            const res = await authFetch(`/api/team/${selectedTeam.id}/members/${member.id}`, { method: 'DELETE' });
            if (res?.ok) {
                refreshTeamDetail(selectedTeam.id);
                showToast('success', '팀원 상태를 변경했습니다.');
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '팀원 변경에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '팀원 변경에 실패했습니다.');
        }
    };

    const handleInvitation = async (invitation, action) => {
        try {
            const res = await authFetch(`/api/team/invitations/${invitation.id}/${action}`, { method: 'POST' });
            if (res?.ok) {
                fetchInvitations();
                fetchTeams();
                fetchNodes();
                showToast('success', action === 'accept' ? '팀 초대를 수락했습니다.' : '팀 초대를 거절했습니다.');
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '초대 처리에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '초대 처리에 실패했습니다.');
        }
    };

    const toggleNodeShare = (nodeId) => {
        setSelectedNodeIds(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    };

    const handleSaveTeamNodes = async () => {
        if (!selectedTeam) return;
        setSavingTeamNodes(true);
        try {
            const res = await authFetch(`/api/team/${selectedTeam.id}/nodes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeIds: Array.from(selectedNodeIds) }),
            });
            if (res?.ok) {
                const options = await res.json();
                setNodeOptions(Array.isArray(options) ? options : []);
                await fetchTeams();
                fetchNodes();
                showToast('success', '팀 공유 노드 설정을 저장했습니다.');
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '공유 노드 저장에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '공유 노드 저장에 실패했습니다.');
        } finally {
            setSavingTeamNodes(false);
        }
    };

    return (
        <>
            {confirmNode && (
                <>
                    <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1055 }}>
                        <div className="modal-dialog mt-4">
                            <div className="modal-content bg-dark border-secondary">
                                <div className="modal-header border-secondary">
                                    <h5 className="modal-title text-light">노드 삭제</h5>
                                    <button type="button" className="btn-close btn-close-white" onClick={() => setConfirmNode(null)} />
                                </div>
                                <div className="modal-body text-light">
                                    <span className="text-info fw-semibold">"{confirmNode.name}"</span> 노드를 삭제할까요?
                                </div>
                                <div className="modal-footer border-secondary">
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmNode(null)}>취소</button>
                                    <button type="button" className="btn btn-danger btn-sm" onClick={handleDeleteNode}>삭제</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="modal-backdrop fade show" style={{ zIndex: 1054 }} onClick={() => setConfirmNode(null)} />
                </>
            )}

            <div className="d-flex vh-100 overflow-hidden">
                <SideBar />

                <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                    <Header title="사용자 프로필" />

                    <main className="flex-grow-1 overflow-y-auto p-2 p-md-4">
                        <h5 className="text-info mb-4">👤 내 프로필</h5>
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
                                    <div className="col-3 text-secondary">이메일</div>
                                    <div className="col-9 text-light">{displayEmail}</div>
                                </div>
                                <div className="row py-2">
                                    <div className="col-3 text-secondary">접근 노드</div>
                                    <div className="col-9 text-light">{nodes.length}개</div>
                                </div>
                                <div className="row py-2 border-top border-secondary">
                                    <div className="col-3 text-secondary">소속 팀</div>
                                    <div className="col-9 text-light">{teams.length}개</div>
                                </div>
                            </div>
                        </div>

                        {invitations.length > 0 && (
                            <div className="card bg-dark border-info mb-4">
                                <div className="card-body">
                                    <h5 className="text-info mb-3">받은 팀 초대</h5>
                                    <div className="d-flex flex-column gap-2">
                                        {invitations.map(invitation => (
                                            <div key={invitation.id} className="d-flex align-items-center justify-content-between gap-3 border border-secondary rounded p-2">
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="text-light fw-semibold text-truncate">{invitation.teamName}</div>
                                                    <small className="text-secondary">초대한 사람: {invitation.invitedByEmail || '-'}</small>
                                                </div>
                                                <div className="d-flex gap-2 flex-shrink-0">
                                                    <button type="button" className="btn btn-info btn-sm" onClick={() => handleInvitation(invitation, 'accept')}>수락</button>
                                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => handleInvitation(invitation, 'reject')}>거절</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <h5 className="text-info mb-3">🔑 계정 토큰</h5>
                        <div className="card bg-dark border-secondary mb-4">
                            <div className="card-body">
                                <p className="text-secondary small mb-3">
                                    Linux PC에 에이전트를 설치할 때 사용하는 토큰입니다. 재발급해도 기존 에이전트는 계속 연결됩니다.
                                </p>
                                <label className="text-secondary small mb-1 d-block">토큰</label>
                                <div className="d-flex align-items-start gap-2 mb-3">
                                    <code className="flex-grow-1 bg-black text-success p-2 rounded small" style={{ wordBreak: 'break-all' }}>
                                        {accountToken || '로딩 중...'}
                                    </code>
                                    <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(accountToken)}>
                                        복사
                                    </button>
                                </div>
                                <label className="text-secondary small mb-1 d-block">설치 명령어</label>
                                <div className="d-flex align-items-start gap-2 mb-3">
                                    <code className="flex-grow-1 bg-black text-info p-2 rounded small" style={{ wordBreak: 'break-all' }}>
                                        {installCommand}
                                    </code>
                                    <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" onClick={() => copyToClipboard(installCommand)}>
                                        복사
                                    </button>
                                </div>
                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={reissueToken}>
                                    토큰 재발급
                                </button>
                            </div>
                        </div>

                        <div className="row g-4">
                            <div className="col-12 col-xl-6">
                                <h5 className="text-info mb-3">🖥️ 접근 가능한 노드</h5>
                                {nodes.length === 0 ? (
                                    <p className="text-muted fst-italic">에이전트를 설치하면 노드가 자동으로 등록됩니다.</p>
                                ) : (
                                    <div className="row g-3">
                                        {[...nodes].sort((a, b) => getNodeStatusMeta(a.status).rank - getNodeStatusMeta(b.status).rank).map(node => {
                                            const statusMeta = getNodeStatusMeta(node.status);
                                            const isDeletePending = node.status === 'D';
                                            return (
                                                <div key={node.id} className="col-12 col-sm-6 col-md-4 col-lg-3 col-xl-4 col-xxl-3">
                                                    <div
                                                        className={`card bg-dark position-relative ${isDeletePending ? 'border-warning' : 'border-secondary'}`}
                                                        style={{ height: '110px', cursor: isDeletePending ? 'default' : 'pointer' }}
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
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className={`btn btn-link p-0 position-absolute ${isDeletePending ? 'text-secondary' : 'text-danger'}`}
                                                            style={{ top: '6px', right: '8px', fontSize: '0.8rem', lineHeight: 1 }}
                                                            disabled={isDeletePending}
                                                            onClick={(e) => { e.stopPropagation(); if (!isDeletePending) setConfirmNode(node); }}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="col-12 col-xl-6">
                                <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                                    <h5 className="text-info mb-0">👥 팀 관리</h5>
                                    <span className="badge text-bg-secondary">{teams.length}개</span>
                                </div>

                                <form className="card bg-dark border-secondary mb-3" onSubmit={handleCreateTeam}>
                                    <div className="card-body d-flex flex-column gap-2">
                                        <input
                                            className="form-control form-control-sm"
                                            value={teamName}
                                            onChange={(e) => setTeamName(e.target.value)}
                                            maxLength={100}
                                            placeholder="팀 이름"
                                        />
                                        <textarea
                                            className="form-control form-control-sm"
                                            value={teamDescription}
                                            onChange={(e) => setTeamDescription(e.target.value)}
                                            maxLength={255}
                                            placeholder="설명"
                                            rows={2}
                                        />
                                        <button type="submit" className="btn btn-info btn-sm align-self-end" disabled={creatingTeam}>
                                            {creatingTeam ? '생성 중...' : '팀 생성'}
                                        </button>
                                    </div>
                                </form>

                                {teams.length === 0 ? (
                                    <p className="text-muted fst-italic">생성되었거나 가입한 팀이 없습니다.</p>
                                ) : (
                                    <div className="d-flex flex-column gap-2 mb-3">
                                        {teams.map(team => (
                                            <button
                                                type="button"
                                                key={team.id}
                                                className={`card bg-dark text-start ${selectedTeamId === team.id ? 'border-info' : 'border-secondary'}`}
                                                onClick={() => setSelectedTeamId(team.id)}
                                            >
                                                <div className="card-body py-3">
                                                    <div className="d-flex align-items-start justify-content-between gap-3">
                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="d-flex align-items-center gap-2">
                                                                <span className="text-light fw-semibold text-truncate">{team.name}</span>
                                                                <span className={`badge ${team.role === 'OWNER' ? 'text-bg-primary' : 'text-bg-secondary'}`}>{team.role}</span>
                                                            </div>
                                                            <small className="text-secondary d-block text-truncate">{team.description || '설명 없음'}</small>
                                                            <small className="text-secondary">팀원 {team.memberCount ?? 0}명 · 공유 노드 {team.nodeCount ?? 0}개</small>
                                                        </div>
                                                        {team.role === 'OWNER' && (
                                                            <span
                                                                role="button"
                                                                tabIndex={0}
                                                                className="btn btn-outline-danger btn-sm flex-shrink-0"
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team); }}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') handleDeleteTeam(team); }}
                                                            >
                                                                삭제
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {selectedTeam && (
                                    <div className="card bg-dark border-secondary">
                                        <div className="card-body">
                                            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                                                <div style={{ minWidth: 0 }}>
                                                    <h6 className="text-light mb-0 text-truncate">{selectedTeam.name}</h6>
                                                    <small className="text-secondary">{selectedTeam.role === 'OWNER' ? '관리 가능' : '멤버'}</small>
                                                </div>
                                            </div>

                                            {!canManageSelectedTeam ? (
                                                <p className="text-muted mb-0">팀 공유 노드에 접근할 수 있습니다. 팀원/공유 설정은 팀 관리자만 변경할 수 있습니다.</p>
                                            ) : loadingTeamDetail ? (
                                                <p className="text-muted mb-0">팀 정보를 불러오는 중...</p>
                                            ) : (
                                                <>
                                                    <form className="d-flex gap-2 mb-3" onSubmit={handleInviteMember}>
                                                        <input
                                                            className="form-control form-control-sm"
                                                            value={inviteEmail}
                                                            onChange={(e) => setInviteEmail(e.target.value)}
                                                            placeholder="초대할 이메일 정확히 입력"
                                                        />
                                                        <button type="submit" className="btn btn-info btn-sm flex-shrink-0">초대</button>
                                                    </form>

                                                    <div className="mb-3">
                                                        <div className="text-secondary small mb-2">팀원</div>
                                                        <div className="d-flex flex-column gap-2">
                                                            {teamMembers.map(member => (
                                                                <div key={member.id} className="d-flex align-items-center justify-content-between gap-2 border border-secondary rounded p-2">
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <div className="text-light text-truncate">{member.email}</div>
                                                                        <small className="text-secondary">{member.role} · {member.status}</small>
                                                                    </div>
                                                                    {member.role !== 'OWNER' && (
                                                                        <button type="button" className="btn btn-outline-danger btn-sm flex-shrink-0" onClick={() => handleRemoveMember(member)}>
                                                                            제거
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="d-flex align-items-center justify-content-between mb-2">
                                                            <div className="text-secondary small">공유 노드</div>
                                                            <button type="button" className="btn btn-outline-info btn-sm" onClick={handleSaveTeamNodes} disabled={savingTeamNodes}>
                                                                {savingTeamNodes ? '저장 중...' : '저장'}
                                                            </button>
                                                        </div>
                                                        {nodeOptions.length === 0 ? (
                                                            <p className="text-muted mb-0">공유할 내 노드가 없습니다.</p>
                                                        ) : (
                                                            <div className="d-flex flex-column gap-2">
                                                                {nodeOptions.map(option => (
                                                                    <label key={option.nodeId} className="d-flex align-items-center gap-2 border border-secondary rounded p-2 text-light">
                                                                        <input
                                                                            type="checkbox"
                                                                            className="form-check-input m-0"
                                                                            checked={selectedNodeIds.has(option.nodeId)}
                                                                            onChange={() => toggleNodeShare(option.nodeId)}
                                                                        />
                                                                        <span className="text-truncate">{option.nodeName}</span>
                                                                        <small className="text-secondary ms-auto">{option.osType}</small>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}

export default Main;
