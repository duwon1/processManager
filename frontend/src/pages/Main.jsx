import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Main() {
    // API에서 가져온 노드 목록
    const [nodes, setNodes] = useState([]);
    const [teams, setTeams] = useState([]);

    // 계정 토큰
    const [accountToken, setAccountToken] = useState('');
    const [teamName, setTeamName] = useState('');
    const [teamDescription, setTeamDescription] = useState('');
    const [creatingTeam, setCreatingTeam] = useState(false);
    // 삭제 확인 모달 대상 노드
    const [confirmNode, setConfirmNode] = useState(null);
    // 작업 결과 알림은 전역 ToastProvider로 전달합니다.
    const { showToast } = useToast();
    const authFetch = useAuthFetch();
    const { accessToken } = useAuth();
    const navigate = useNavigate();

    // 노드 상태값을 화면 표시용 색상/문구로 변환합니다.
    const getNodeStatusMeta = (status) => {
        if (status === 'Y') return { label: '온라인', dotClass: 'bg-success', textClass: 'text-success', rank: 0 };
        if (status === 'D') return { label: '삭제 대기', dotClass: 'bg-warning', textClass: 'text-warning', rank: 1 };
        return { label: '오프라인', dotClass: 'bg-danger', textClass: 'text-danger', rank: 2 };
    };

    // localStorage 대신 메모리(context)의 액세스 토큰에서 이메일을 파생합니다.
    const email = useMemo(() => {
        if (!accessToken) return '';
        try {
            const payload = JSON.parse(atob(accessToken.split('.')[1]));
            return payload.sub ?? '';
        } catch {
            return '';
        }
    }, [accessToken]);

    // 노드 목록을 서버에서 새로 불러옵니다.
    // 401 응답 시 authFetch가 자동으로 로그인 페이지로 이동합니다.
    const fetchNodes = useCallback(() => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setNodes(data))
            .catch(() => setNodes([]));
    }, [authFetch]);

    // 계정 토큰을 서버에서 조회합니다.
    const fetchAccountToken = useCallback(() => {
        authFetch('/api/user/token')
            .then(res => res && res.ok ? res.json() : {})
            .then(data => setAccountToken(data.accountToken || ''))
            .catch(() => {});
    }, [authFetch]);

    const fetchTeams = useCallback(() => {
        authFetch('/api/team/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setTeams(Array.isArray(data) ? data : []))
            .catch(() => setTeams([]));
    }, [authFetch]);

    // JWT가 바뀌면 현재 계정 기준의 API 데이터를 다시 조회하고, 삭제 ACK 반영을 위해 주기적으로 갱신합니다.
    useEffect(() => {
        fetchNodes();
        fetchAccountToken();
        fetchTeams();
        const intervalId = setInterval(fetchNodes, 5000);
        return () => clearInterval(intervalId);
    }, [fetchNodes, fetchAccountToken, fetchTeams]);

    // 계정 토큰을 재발급합니다.
    const reissueToken = () => {
        if (!confirm('새 설치용 토큰을 재발급할까요? 기존 에이전트는 계속 연결됩니다.')) return;
        authFetch('/api/user/token/reissue', { method: 'POST' })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => {
                // 토큰 재발급 결과도 전역 Toast로 알려 브라우저 기본 alert 사용을 없앱니다.
                setAccountToken(data.accountToken);
                showToast('success', '설치용 토큰이 재발급되었습니다.');
            })
            .catch(() => showToast('danger', '토큰 재발급에 실패했습니다.'));
    };

    // 클립보드에 텍스트를 복사합니다.
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('success', '클립보드에 복사되었습니다.');
        } catch {
            showToast('danger', '복사에 실패했습니다.');
        }
    };

    // 설치 명령어 — 현재 접속 중인 서버 주소를 자동으로 사용합니다.
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    // 개발/배포 설치가 한 PC에서 서로 덮어쓰지 않도록 에이전트 인스턴스명을 환경별로 분리합니다.
    const agentInstance = import.meta.env.VITE_AGENT_INSTANCE
        || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'dev' : 'prod');
    // ngrok 무료 도메인은 curl 요청에도 경고 페이지를 반환하므로 설치 스크립트 요청에 skip 헤더를 붙입니다.
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
                    showToast('success', `'${nodeName}' 노드 삭제가 예약되었습니다.`);
                } else {
                    showToast('danger', '노드 삭제에 실패했습니다.');
                }
            })
            .catch(() => showToast('danger', '노드 삭제에 실패했습니다.'));
    };

    const readErrorMessage = async (res, fallback) => {
        try {
            const data = await res.json();
            return data.message || fallback;
        } catch {
            return fallback;
        }
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
                setTeams(prev => [created, ...prev]);
                setTeamName('');
                setTeamDescription('');
                showToast('success', `'${created.name}' 팀을 생성했습니다.`);
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
        if (!confirm(`'${team.name}' 팀을 삭제하시겠습니까?`)) return;
        try {
            const res = await authFetch(`/api/team/${team.id}`, { method: 'DELETE' });
            if (res?.ok) {
                setTeams(prev => prev.filter(item => item.id !== team.id));
                showToast('success', `'${team.name}' 팀을 삭제했습니다.`);
            } else if (res) {
                showToast('danger', await readErrorMessage(res, '팀 삭제에 실패했습니다.'));
            }
        } catch {
            showToast('danger', '팀 삭제에 실패했습니다.');
        }
    };

    return (
        <>
        {/* 노드 삭제 확인 모달 */}
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
                                <span className="text-info fw-semibold">"{confirmNode.name}"</span> 노드를 삭제하시겠습니까?
                            </div>
                            <div className="modal-footer border-secondary">
                                <button className="btn btn-secondary btn-sm" onClick={() => setConfirmNode(null)}>취소</button>
                                <button className="btn btn-danger btn-sm" onClick={handleDeleteNode}>삭제</button>
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

                    {/* 사용자 프로필 카드 */}
                    <h5 className="text-info mb-4">👤 사용자 프로필</h5>
                    <div className="card bg-dark border-secondary mb-4">
                        <div className="card-body">
                            <div className="row py-2 border-bottom border-secondary">
                                <div className="col-3 text-secondary">이메일</div>
                                <div className="col-9 text-light">{email}</div>
                            </div>
                            <div className="row py-2">
                                <div className="col-3 text-secondary">등록 노드</div>
                                <div className="col-9 text-light">{nodes.length}개</div>
                            </div>
                            <div className="row py-2 border-top border-secondary">
                                <div className="col-3 text-secondary">등록 팀</div>
                                <div className="col-9 text-light">{teams.length}개</div>
                            </div>
                        </div>
                    </div>

                    {/* 계정 토큰 섹션 */}
                    <h5 className="text-info mb-3">🔑 계정 토큰</h5>
                    <div className="card bg-dark border-secondary mb-4">
                        <div className="card-body">
                            <p className="text-secondary small mb-3">
                                Linux PC에 에이전트를 설치할 때 사용하는 토큰입니다. 재발급해도 기존 에이전트는 계속 연결됩니다.
                            </p>

                            {/* 토큰 표시 */}
                            <label className="text-secondary small mb-1 d-block">토큰</label>
                            <div className="d-flex align-items-start gap-2 mb-3">
                                <code className="flex-grow-1 bg-black text-success p-2 rounded small"
                                      style={{ wordBreak: 'break-all' }}>
                                    {accountToken || '로딩 중...'}
                                </code>
                                <button
                                    className="btn btn-outline-secondary btn-sm flex-shrink-0"
                                    onClick={() => copyToClipboard(accountToken)}
                                >
                                    복사
                                </button>
                            </div>

                            {/* 설치 명령어 */}
                            <label className="text-secondary small mb-1 d-block">설치 명령어</label>
                            <div className="d-flex align-items-start gap-2 mb-3">
                                <code className="flex-grow-1 bg-black text-info p-2 rounded small"
                                      style={{ wordBreak: 'break-all' }}>
                                    {installCommand}
                                </code>
                                <button
                                    className="btn btn-outline-secondary btn-sm flex-shrink-0"
                                    onClick={() => copyToClipboard(installCommand)}
                                >
                                    복사
                                </button>
                            </div>

                            {/* 재발급 버튼 */}
                            <button className="btn btn-outline-danger btn-sm" onClick={reissueToken}>
                                토큰 재발급
                            </button>
                        </div>
                    </div>

                    <div className="row g-4">
                        {/* 등록된 노드 목록 */}
                        <div className="col-12 col-xl-6">
                            <h5 className="text-info mb-3">🖥️ 등록된 노드</h5>
                            {nodes.length === 0 ? (
                                <p className="text-muted fst-italic">에이전트를 설치하면 자동으로 노드가 등록됩니다.</p>
                            ) : (
                                <div className="row g-3">
                                    {[...nodes].sort((a, b) => getNodeStatusMeta(a.status).rank - getNodeStatusMeta(b.status).rank).map(node => {
                                        const statusMeta = getNodeStatusMeta(node.status);
                                        const isDeletePending = node.status === 'D';
                                        return (
                                            <div key={node.id} className="col-12 col-sm-6 col-md-4 col-lg-3 col-xl-4 col-xxl-3">
                                                <div
                                                    className={`card bg-dark position-relative ${isDeletePending ? 'border-warning' : 'border-secondary'}`}
                                                    style={{ height: '96px', cursor: isDeletePending ? 'default' : 'pointer' }}
                                                    onClick={() => { if (!isDeletePending) navigate(`/dashboard/${node.id}`); }}
                                                >
                                                    <div className="card-body">
                                                        <div className="d-flex align-items-center gap-2 mb-2">
                                                            <span
                                                                className={`rounded-circle ${statusMeta.dotClass}`}
                                                                style={{ width: '10px', height: '10px', flexShrink: 0 }}
                                                            />
                                                            <h6 className="m-0 text-light text-truncate pe-3">{node.name}</h6>
                                                        </div>
                                                        <small className="text-secondary d-block text-truncate">{node.osType}</small>
                                                        <small className={`d-block fw-semibold ${statusMeta.textClass}`}>{statusMeta.label}</small>
                                                    </div>
                                                    {/* 삭제 버튼 — 삭제 대기 중에는 중복 요청을 막기 위해 비활성화합니다. */}
                                                    <button
                                                        className={`btn btn-link p-0 position-absolute ${isDeletePending ? 'text-secondary' : 'text-danger'}`}
                                                        style={{ top: '6px', right: '8px', fontSize: '0.8rem', lineHeight: 1 }}
                                                        disabled={isDeletePending}
                                                        onClick={(e) => { e.stopPropagation(); if (!isDeletePending) setConfirmNode(node); }}
                                                    >✕</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 등록된 팀 목록 */}
                        <div className="col-12 col-xl-6">
                            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                                <h5 className="text-info mb-0">👥 등록된 팀</h5>
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
                                    <button className="btn btn-info btn-sm align-self-end" disabled={creatingTeam}>
                                        {creatingTeam ? '생성 중...' : '팀 생성'}
                                    </button>
                                </div>
                            </form>

                            {teams.length === 0 ? (
                                <p className="text-muted fst-italic">생성된 팀이 없습니다.</p>
                            ) : (
                                <div className="d-flex flex-column gap-2">
                                    {teams.map(team => (
                                        <div key={team.id} className="card bg-dark border-secondary">
                                            <div className="card-body py-3">
                                                <div className="d-flex align-items-start gap-3">
                                                    <div
                                                        className="rounded-circle bg-info bg-opacity-75 d-flex align-items-center justify-content-center text-dark fw-bold flex-shrink-0"
                                                        style={{ width: '34px', height: '34px' }}
                                                    >
                                                        {(team.name || 'T')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div className="text-light fw-semibold text-truncate">{team.name}</div>
                                                        <small className="text-secondary d-block text-truncate">
                                                            {team.description || '설명 없음'}
                                                        </small>
                                                    </div>
                                                    <button
                                                        className="btn btn-outline-danger btn-sm flex-shrink-0"
                                                        onClick={() => handleDeleteTeam(team)}
                                                    >
                                                        삭제
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
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
