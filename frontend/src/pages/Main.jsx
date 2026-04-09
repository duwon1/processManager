import React, { useEffect, useState } from 'react';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useAuth } from '../context/AuthContext';

function Main() {
    // 사용자 이메일 (JWT 디코딩)
    const [email, setEmail] = useState('');

    // API에서 가져온 노드 목록
    const [nodes, setNodes] = useState([]);

    // 계정 토큰
    const [accountToken, setAccountToken] = useState('');
    // 삭제 확인 모달 대상 노드
    const [confirmNode, setConfirmNode] = useState(null);
    // 작업 결과 토스트 목록 (여러 개 쌓임)
    const [toasts, setToasts] = useState([]); // [{ id, type, message, visible }]
    const authFetch = useAuthFetch();
    const { accessToken } = useAuth();

    // 토스트를 추가하고 페이드인 → 페이드아웃 → collapse → 제거합니다.
    const showToast = (type, message) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, type, message, visible: false }]);
        setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: true  } : t)), 10);
        setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t)), 2500);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3100);
    };

    const dismissToast = (id) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, visible: false } : t));
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 600);
    };

    // JWT에서 이메일 추출 + 노드 목록 + 계정 토큰 조회
    useEffect(() => {
        // localStorage 대신 메모리(context)의 액세스 토큰에서 이메일 추출
        if (accessToken) {
            try {
                const payload = JSON.parse(atob(accessToken.split('.')[1]));
                setEmail(payload.sub);
            } catch (_) {}
        }
        fetchNodes();
        fetchAccountToken();
    }, [accessToken]);

    // 노드 목록을 서버에서 새로 불러옵니다.
    // 401 응답 시 authFetch가 자동으로 로그인 페이지로 이동합니다.
    const fetchNodes = () => {
        authFetch('/api/node/list')
            .then(res => res && res.ok ? res.json() : [])
            .then(data => setNodes(data))
            .catch(() => setNodes([]));
    };

    // 계정 토큰을 서버에서 조회합니다.
    const fetchAccountToken = () => {
        authFetch('/api/user/token')
            .then(res => res && res.ok ? res.json() : {})
            .then(data => setAccountToken(data.accountToken || ''))
            .catch(() => {});
    };

    // 계정 토큰을 재발급합니다.
    const reissueToken = () => {
        if (!confirm('토큰을 재발급하면 기존 에이전트가 모두 연결 해제됩니다. 계속할까요?')) return;
        authFetch('/api/user/token/reissue', { method: 'POST' })
            .then(res => res && res.ok ? res.json() : Promise.reject())
            .then(data => setAccountToken(data.accountToken))
            .catch(() => alert('토큰 재발급에 실패했습니다.'));
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
    const installCommand = accountToken
        ? `curl -sSL ${serverUrl}/agent/install.sh | sudo bash -s -- --server ${serverUrl} --token ${accountToken}`
        : '';

    const handleDeleteNode = () => {
        if (!confirmNode) return;
        const nodeName = confirmNode.name;
        setConfirmNode(null);
        authFetch(`/api/node/${confirmNode.id}`, { method: 'DELETE' })
            .then(res => {
                if (res?.ok) {
                    fetchNodes();
                    showToast('success', `'${nodeName}' 노드가 삭제되었습니다.`);
                } else {
                    showToast('danger', '노드 삭제에 실패했습니다.');
                }
            })
            .catch(() => showToast('danger', '노드 삭제에 실패했습니다.'));
    };

    return (
        <>
        {/* 작업 결과 토스트 (여러 개 아래로 쌓임) */}
        <div className="position-fixed top-0 end-0 p-3 d-flex flex-column" style={{ zIndex: 1090 }}>
            {toasts.map(t => (
                <div key={t.id}
                     className={`toast show text-bg-${t.type} border-0 shadow-lg`}
                     role="alert"
                     style={{
                         minWidth: '260px',
                         overflow: 'hidden',
                         opacity: t.visible ? 1 : 0,
                         maxHeight: t.visible ? '80px' : '0',
                         marginBottom: t.visible ? '8px' : '0',
                         transform: t.visible ? 'translateY(0)' : 'translateY(-8px)',
                         transition: 'opacity 0.3s ease, transform 0.3s ease, max-height 0.35s ease 0.15s, margin-bottom 0.35s ease 0.15s',
                     }}>
                    <div className="d-flex align-items-center px-3 py-3 gap-2">
                        <span style={{ fontSize: '1.1rem' }}>{t.type === 'success' ? '✓' : '✕'}</span>
                        <span className="fw-semibold me-auto">{t.message}</span>
                        <button type="button" className="btn-close btn-close-white ms-1"
                                onClick={() => dismissToast(t.id)} />
                    </div>
                </div>
            ))}
        </div>
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

            <div className="d-flex flex-column flex-grow-1">
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
                        </div>
                    </div>

                    {/* 계정 토큰 섹션 */}
                    <h5 className="text-info mb-3">🔑 계정 토큰</h5>
                    <div className="card bg-dark border-secondary mb-4">
                        <div className="card-body">
                            <p className="text-secondary small mb-3">
                                Linux PC에 에이전트를 설치할 때 사용하는 토큰입니다. 재발급 시 모든 에이전트가 연결 해제됩니다.
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
                                    {[...nodes].sort((a, b) => (a.status === 'Y' ? -1 : 1) - (b.status === 'Y' ? -1 : 1)).map(node => (
                                        <div key={node.id} className="col-12 col-sm-6 col-md-4 col-lg-3 col-xl-4 col-xxl-3">
                                            <div className="card bg-dark border-secondary position-relative" style={{ height: '80px' }}>
                                                <div className="card-body">
                                                    <div className="d-flex align-items-center gap-2 mb-2">
                                                        <span
                                                            className={`rounded-circle ${node.status === 'Y' ? 'bg-success' : 'bg-danger'}`}
                                                            style={{ width: '10px', height: '10px', flexShrink: 0 }}
                                                        />
                                                        <h6 className="m-0 text-light text-truncate pe-3">{node.name}</h6>
                                                    </div>
                                                    <small className="text-secondary d-block">{node.osType}</small>
                                                </div>
                                                {/* 삭제 버튼 — 카드 우상단 고정 */}
                                                <button
                                                    className="btn btn-link text-danger p-0 position-absolute"
                                                    style={{ top: '6px', right: '8px', fontSize: '0.8rem', lineHeight: 1 }}
                                                    onClick={() => setConfirmNode(node)}
                                                >✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 등록된 팀 목록 */}
                        <div className="col-12 col-xl-6">
                            <h5 className="text-info mb-3">👥 등록된 팀</h5>
                            <p className="text-muted fst-italic">생성된 팀이 없습니다.</p>
                        </div>
                    </div>
                </main>
            </div>

        </div>
        </>
    );
}

export default Main;
