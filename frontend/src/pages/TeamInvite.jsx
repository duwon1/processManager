import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppHeader } from '../hooks/useAppHeader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { readApiErrorMessage } from '../utils/apiErrorMessage';
import { getMemberStatusMeta } from '../utils/teamMeta';

const STATUS_MESSAGE = {
  INVITED: '초대를 확인한 뒤 수락하거나 거절할 수 있습니다.',
  ACTIVE: '이미 수락한 초대입니다.',
  REJECTED: '이미 거절한 초대입니다.',
  CANCELLED: '초대가 취소되었습니다.',
  REMOVED: '더 이상 사용할 수 없는 초대입니다.',
};

const INVITE_HEADER = { title: '팀 초대' };

function TeamInvite() {
  const { inviteToken } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const authFetch = useAuthFetch();
  const { logout } = useAuth();
  const { showToast } = useToast();

  useAppHeader(INVITE_HEADER);

  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingAction, setProcessingAction] = useState(null);

  const currentPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  );

  const loadInvitation = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await authFetch(`/api/team/invitations/link/${encodeURIComponent(inviteToken || '')}`);
      if (res?.ok) {
        setInvitation(await res.json());
      } else if (res) {
        setInvitation(null);
        setErrorMessage(await readApiErrorMessage(res, '초대 링크를 확인할 수 없습니다.'));
      } else {
        setInvitation(null);
        setErrorMessage('로그인이 필요합니다.');
      }
    } catch {
      setInvitation(null);
      setErrorMessage('초대 링크를 확인할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, inviteToken]);

  useEffect(() => {
    loadInvitation();
  }, [loadInvitation]);

  const handleInvitationAction = async (action) => {
    setProcessingAction(action);
    setErrorMessage('');
    try {
      const res = await authFetch(`/api/team/invitations/link/${encodeURIComponent(inviteToken || '')}/${action}`, {
        method: 'POST',
      });
      if (res?.ok) {
        const updated = await res.json();
        setInvitation(updated);
        showToast('success', action === 'accept' ? '팀 초대를 수락했습니다.' : '팀 초대를 거절했습니다.');
      } else if (res) {
        setErrorMessage(await readApiErrorMessage(res, '초대 처리에 실패했습니다.'));
      } else {
        setErrorMessage('로그인이 필요합니다.');
      }
    } catch {
      setErrorMessage('초대 처리에 실패했습니다.');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleSwitchAccount = () => {
    logout({
      reason: 'manual',
      state: {
        from: currentPath,
        logoutReason: 'manual',
      },
    });
  };

  const statusMeta = invitation ? getMemberStatusMeta(invitation.status) : null;
  const isPending = invitation?.status === 'INVITED';
  const statusMessage = invitation
    ? STATUS_MESSAGE[invitation.status] || '현재 초대 상태를 확인했습니다.'
    : '';
  const isAccountMismatch = errorMessage.includes('초대받은 계정');

  return (
        <main className="flex-grow-1 overflow-y-auto p-2 p-md-4">
          <div className="invite-page-shell">
            <section className="team-surface invite-confirm-surface">
              <div className="invite-confirm-header">
                <span className="invite-confirm-icon" aria-hidden="true">
                  <i className="bi bi-envelope-open"></i>
                </span>
                <div className="min-w-0">
                  <h5 className="text-info mb-1">팀 초대 확인</h5>
                  <p className="text-secondary mb-0">초대받은 계정으로 로그인한 경우에만 처리할 수 있습니다. 초대 링크는 30분 동안 유효합니다.</p>
                </div>
              </div>

              {loading ? (
                <div className="invite-confirm-state">
                  <span className="spinner-border spinner-border-sm text-info"></span>
                  <span>초대 정보를 확인하는 중...</span>
                </div>
              ) : errorMessage ? (
                <div className="invite-confirm-state invite-confirm-state-error">
                  <i className="bi bi-exclamation-triangle text-warning"></i>
                  <div className="min-w-0">
                    <div className="text-light fw-semibold mb-1">{errorMessage}</div>
                    <div className="text-secondary small">초대 메일을 받은 Google 계정으로 다시 로그인해 주세요.</div>
                  </div>
                  <div className="invite-confirm-actions">
                    {isAccountMismatch && (
                      <button type="button" className="btn btn-outline-info btn-sm" onClick={handleSwitchAccount}>
                        <i className="bi bi-arrow-repeat me-1"></i>다른 계정으로 로그인
                      </button>
                    )}
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/settings/teams')}>
                      팀 관리로 이동
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="invite-team-summary">
                    <div className="invite-team-avatar" aria-hidden="true">
                      {(invitation.teamName || 'T')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-secondary small">초대된 팀</div>
                      <div className="invite-team-name">{invitation.teamName}</div>
                      <div className="invite-team-meta">
                        <span>초대한 사람: {invitation.invitedByEmail || '-'}</span>
                        {statusMeta && <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="invite-confirm-message">
                    <i className={`bi ${isPending ? 'bi-info-circle text-info' : 'bi-check2-circle text-secondary'}`}></i>
                    <span>{statusMessage}</span>
                  </div>

                  <div className="invite-confirm-actions">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-info"
                          disabled={Boolean(processingAction)}
                          onClick={() => handleInvitationAction('accept')}
                        >
                          {processingAction === 'accept' ? (
                            <span className="spinner-border spinner-border-sm me-1"></span>
                          ) : (
                            <i className="bi bi-check-lg me-1"></i>
                          )}
                          초대 수락
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={Boolean(processingAction)}
                          onClick={() => handleInvitationAction('reject')}
                        >
                          {processingAction === 'reject' ? (
                            <span className="spinner-border spinner-border-sm me-1"></span>
                          ) : (
                            <i className="bi bi-x-lg me-1"></i>
                          )}
                          거절
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-info" onClick={() => navigate('/settings/teams')}>
                        팀 관리에서 확인
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </main>
  );
}

export default TeamInvite;
