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
    const authFetch = useAuthFetch();
    const { accessToken } = useAuth();

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
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    // 설치 명령어 (account_token이 포함된 에이전트 설치 스크립트)
    const installCommand = accountToken
        ? `curl -sSL http://localhost:8080/agent/install.sh | sudo bash -s -- --server http://localhost:8080 --token ${accountToken}`
        : '';

    return (
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
                                        <div key={node.id} className="col-12 col-sm-6 col-md-4 col-lg-3">
                                            <div className="card bg-dark border-secondary" style={{ height: '80px' }}>
                                                <div className="card-body">
                                                    <div className="d-flex align-items-center gap-2 mb-2">
                                                        <span
                                                            className={`rounded-circle ${node.status === 'Y' ? 'bg-success' : 'bg-danger'}`}
                                                            style={{ width: '10px', height: '10px', flexShrink: 0 }}
                                                        />
                                                        <h6 className="m-0 text-light text-truncate">{node.name}</h6>
                                                    </div>
                                                    <small className="text-secondary d-block">{node.osType}</small>
                                                </div>
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
    );
}

export default Main;
