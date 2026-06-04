import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppHeader } from '../hooks/useAppHeader';
import { useAuth } from '../context/AuthContext';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { readApiErrorMessage } from '../utils/apiErrorMessage';
import { readJwtSubject } from '../utils/authToken';
import { NotificationRulesContent } from './NotificationRules';
import { TeamsContent } from './Teams';

const HEADER = { title: '설정' };

function Settings({ section = 'home' }) {
    const navigate = useNavigate();
    const authFetch = useAuthFetch();
    const dialog = useDialog();
    const { showToast } = useToast();
    const { accessToken, logout } = useAuth();

    useAppHeader(HEADER);

    const email = useMemo(() => readJwtSubject(accessToken), [accessToken]);

    const handleDeleteAccount = async () => {
        const typed = await dialog.prompt({
            title: '회원탈퇴',
            message: '계정을 삭제하면 등록된 노드와 개인 설정을 복구할 수 없습니다.',
            detail: '진행하려면 아래 입력칸에 동의 문구를 정확히 입력하세요.',
            icon: 'bi-person-x',
            confirmLabel: '회원탈퇴',
            confirmVariant: 'danger',
            requiredText: '동의합니다',
            inputLabel: '"동의합니다"를 입력하세요.',
        });
        if (typed !== '동의합니다') return;

        try {
            const res = await authFetch('/api/user/me', { method: 'DELETE' });
            if (res?.ok) {
                showToast({ type: 'success', title: '회원탈퇴 완료', message: '계정이 삭제되었습니다.' });
                logout({ reason: 'accountDeleted' });
            } else if (res) {
                showToast({
                    type: 'danger',
                    title: '회원탈퇴 실패',
                    message: await readApiErrorMessage(res, '회원탈퇴에 실패했습니다.'),
                });
            }
        } catch {
            showToast({ type: 'danger', title: '회원탈퇴 실패', message: '회원탈퇴에 실패했습니다.' });
        }
    };

    if (section === 'notification-rules') {
        return (
            <main className="main-page settings-page flex-grow-1 overflow-y-auto p-2 p-md-3">
                <div className="settings-subpage-head">
                    <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => navigate('/settings')}
                    >
                        <i className="bi bi-chevron-left me-1"></i>설정
                    </button>
                    <div>
                        <h5 className="text-info mb-0">알림 규칙</h5>
                        <small className="text-secondary">조건 기반 알림 관리</small>
                    </div>
                </div>
                <NotificationRulesContent />
            </main>
        );
    }

    if (section === 'teams') {
        return (
            <main className="main-page settings-page teams-main teams-v2-main flex-grow-1 overflow-y-auto p-2 p-md-3">
                <div className="settings-subpage-head">
                    <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => navigate('/settings')}
                    >
                        <i className="bi bi-chevron-left me-1"></i>설정
                    </button>
                    <div>
                        <h5 className="text-info mb-0">팀 관리</h5>
                        <small className="text-secondary">팀, 멤버, 공유 노드 관리</small>
                    </div>
                </div>
                <TeamsContent />
            </main>
        );
    }

    return (
        <main className="main-page settings-page flex-grow-1 overflow-y-auto p-2 p-md-3">
            <div className="settings-shell">
                <section className="main-panel settings-panel">
                    <div className="settings-panel-head">
                        <h5>설정</h5>
                        <span>{email || '현재 로그인 계정'}</span>
                    </div>

                    <div className="settings-group">
                        <div className="settings-group-title">계정</div>
                        <div className="settings-row settings-row-static">
                            <span className="settings-row-icon">
                                <i className="bi bi-person-circle" aria-hidden="true"></i>
                            </span>
                            <span className="settings-row-copy">
                                <strong>회원 정보</strong>
                                <small>{email || '사용자'}</small>
                            </span>
                        </div>
                    </div>

                    <div className="settings-group">
                        <div className="settings-group-title">관리</div>
                        <button type="button" className="settings-row" onClick={() => navigate('/settings/teams')}>
                            <span className="settings-row-icon">
                                <i className="bi bi-people" aria-hidden="true"></i>
                            </span>
                            <span className="settings-row-copy">
                                <strong>팀 관리</strong>
                                <small>팀, 멤버, 권한</small>
                            </span>
                            <i className="bi bi-chevron-right settings-row-chevron" aria-hidden="true"></i>
                        </button>
                        <button type="button" className="settings-row" onClick={() => navigate('/settings/notification-rules')}>
                            <span className="settings-row-icon">
                                <i className="bi bi-bell" aria-hidden="true"></i>
                            </span>
                            <span className="settings-row-copy">
                                <strong>알림 규칙</strong>
                                <small>CPU, GPU, 메모리, 디스크 조건</small>
                            </span>
                            <i className="bi bi-chevron-right settings-row-chevron" aria-hidden="true"></i>
                        </button>
                    </div>

                    <div className="settings-group">
                        <div className="settings-group-title">위험 작업</div>
                        <button type="button" className="settings-row settings-row-danger" onClick={handleDeleteAccount}>
                            <span className="settings-row-icon">
                                <i className="bi bi-person-x" aria-hidden="true"></i>
                            </span>
                            <span className="settings-row-copy">
                                <strong>회원탈퇴</strong>
                                <small>계정 삭제</small>
                            </span>
                            <i className="bi bi-chevron-right settings-row-chevron" aria-hidden="true"></i>
                        </button>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default Settings;
