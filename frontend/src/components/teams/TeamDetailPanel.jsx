import { useState } from 'react';
import { getNodeStatusMeta } from '../../utils/nodeStatus';
import { getMemberStatusMeta, getRoleMeta } from '../../utils/teamMeta';

function TeamMemberRow({ member, onRemoveMember }) {
  const roleMeta = getRoleMeta(member.role);
  const statusMeta = getMemberStatusMeta(member.status);

  return (
    <div className="team-data-row">
      <div className="team-member-avatar" aria-hidden="true">{(member.email || 'U')[0].toUpperCase()}</div>
      <div className="min-w-0 flex-grow-1">
        <div className="text-light fw-semibold text-truncate">{member.email}</div>
        <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
          <span className={`badge ${roleMeta.className}`}>{roleMeta.label}</span>
          <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
        </div>
      </div>
      {member.role !== 'OWNER' && (
        <button
          type="button"
          className="btn btn-outline-danger btn-sm flex-shrink-0 team-member-remove"
          onClick={() => onRemoveMember(member)}
          aria-label={`${member.email} 제거`}
        >
          <i className="bi bi-person-dash me-1"></i>제거
        </button>
      )}
    </div>
  );
}

function TeamNodeOption({ option, checked, onToggleNodeShare }) {
  const statusMeta = getNodeStatusMeta(option.status);

  return (
    <label className={`team-node-option ${checked ? 'team-node-option-active' : ''}`}>
      <input
        type="checkbox"
        className="form-check-input m-0 flex-shrink-0"
        checked={checked}
        onChange={() => onToggleNodeShare(option.nodeId)}
      />
      <span className="min-w-0 flex-grow-1">
        <span className="text-light fw-semibold text-truncate d-block">{option.nodeName}</span>
        <span className="d-flex align-items-center gap-2 small">
          <span className={`rounded-circle ${statusMeta.dotClass}`} style={{ width: 7, height: 7 }}></span>
          <span className={statusMeta.className}>{statusMeta.label}</span>
          <span className="text-secondary text-truncate">{option.osType || '-'}</span>
          {checked && <span className="badge text-bg-info team-selected-mark team-node-selected-mark">선택됨</span>}
        </span>
      </span>
    </label>
  );
}

function TeamDetailPanel({
  activeMemberCount,
  canManageMembers,
  canManageNodes,
  inviteEmail,
  invitedMemberCount,
  loadingTeamDetail,
  nodeOptions,
  savingTeamNodes,
  selectedNodeIds,
  selectedTeam,
  sharedNodeCount,
  teamMembers,
  onDeleteTeam,
  onInviteEmailChange,
  onInviteMember,
  onRemoveMember,
  onRenameTeam,
  onSaveTeamNodes,
  onToggleNodeShare,
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  if (!selectedTeam) {
    return (
      <section id="team-detail-section" className="team-surface team-detail-surface p-3 p-lg-4" style={{ minWidth: 0 }}>
        <div className="team-empty-state team-empty-state-large">
          <i className="bi bi-layout-sidebar text-info"></i>
          <span>왼쪽에서 팀을 선택하세요.</span>
        </div>
      </section>
    );
  }

  const selectedRoleMeta = getRoleMeta(selectedTeam.role);
  const canRenameTeam = selectedTeam.role === 'OWNER';

  const startNameEdit = () => {
    setNameDraft(selectedTeam.name || '');
    setEditingName(true);
  };

  const cancelNameEdit = () => {
    setNameDraft(selectedTeam.name || '');
    setEditingName(false);
  };

  const submitNameEdit = async (event) => {
    event.preventDefault();
    if (!canRenameTeam || savingName) return;
    setSavingName(true);
    const saved = await onRenameTeam?.(selectedTeam, nameDraft);
    setSavingName(false);
    if (saved) {
      setEditingName(false);
    }
  };

  return (
    <section id="team-detail-section" className="team-surface team-detail-surface p-3 p-lg-4" style={{ minWidth: 0 }}>
      <div className="team-detail-heading d-flex flex-column flex-md-row align-items-md-start justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-start gap-3 min-w-0">
          <div className="team-detail-avatar" aria-hidden="true">{(selectedTeam.name || 'T')[0].toUpperCase()}</div>
          <div className="min-w-0">
            {editingName ? (
              <form className="team-name-edit-form mb-1" onSubmit={submitNameEdit}>
                <input
                  className="form-control form-control-sm"
                  value={nameDraft}
                  maxLength={100}
                  autoFocus
                  disabled={savingName}
                  onChange={(event) => setNameDraft(event.target.value)}
                  aria-label="팀 이름"
                />
                <div className="team-name-edit-actions">
                  <button type="submit" className="btn btn-info btn-sm" disabled={savingName} aria-label="팀 이름 저장">
                    <i className="bi bi-check-lg"></i>
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={cancelNameEdit} disabled={savingName} aria-label="팀 이름 변경 취소">
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              </form>
            ) : (
              <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                <h5 className="text-light mb-0 text-truncate">{selectedTeam.name}</h5>
                {canRenameTeam && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm team-name-edit-button"
                    onClick={startNameEdit}
                    aria-label="팀 이름 변경"
                  >
                    <i className="bi bi-pencil"></i>
                  </button>
                )}
                <span className={`badge ${selectedRoleMeta.className}`}>{selectedRoleMeta.label}</span>
                <span className="badge text-bg-info team-selected-mark team-detail-selected-mark">선택됨</span>
              </div>
            )}
          </div>
        </div>
        {selectedTeam.role === 'OWNER' && (
          <button type="button" className="btn btn-outline-danger btn-sm flex-shrink-0" onClick={() => onDeleteTeam(selectedTeam)}>
            <i className="bi bi-trash me-1"></i>팀 삭제
          </button>
        )}
      </div>

      <div className="team-metric-grid mb-4">
        <div className="team-metric-cell">
          <span className="text-secondary small">멤버</span>
          <strong className="text-light">{selectedTeam.memberCount ?? activeMemberCount}</strong>
        </div>
        <div className="team-metric-cell">
          <span className="text-secondary small">초대 대기</span>
          <strong className="text-light">{invitedMemberCount}</strong>
        </div>
        <div className="team-metric-cell">
          <span className="text-secondary small">공유 노드</span>
          <strong className="text-light">{sharedNodeCount}</strong>
        </div>
      </div>

      {!canManageMembers ? (
        <div className="team-empty-state">
          <i className="bi bi-lock text-secondary"></i>
          <span>팀 관리 권한이 없습니다. 공유된 노드는 사이드바에서 접근할 수 있습니다.</span>
        </div>
      ) : loadingTeamDetail ? (
        <div className="team-empty-state">
          <span className="spinner-border spinner-border-sm text-info"></span>
          <span>팀 정보를 불러오는 중...</span>
        </div>
      ) : (
        <div className="team-detail-grid">
          <section id="team-members-section" className="team-subsection">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3 team-subsection-header">
              <div>
                <h6 className="text-info mb-0">멤버 관리</h6>
                <small className="text-secondary team-mobile-muted">정확한 이메일로만 초대합니다.</small>
              </div>
              <span className="badge text-bg-secondary">{teamMembers.length}</span>
            </div>

            <form className="d-flex gap-2 mb-3 team-inline-form" onSubmit={onInviteMember}>
              <input
                className="form-control form-control-sm"
                id="team-invite-email"
                type="email"
                inputMode="email"
                value={inviteEmail}
                onChange={(e) => onInviteEmailChange(e.target.value)}
                placeholder="초대할 이메일"
              />
              <button type="submit" className="btn btn-info btn-sm flex-shrink-0 team-invite-button">
                <i className="bi bi-send me-1"></i>멤버 초대
              </button>
            </form>

            {teamMembers.length === 0 ? (
              <div className="team-empty-state">
                <i className="bi bi-person-lines-fill text-secondary"></i>
                <span>멤버가 없습니다.</span>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {teamMembers.map(member => (
                  <TeamMemberRow key={member.id} member={member} onRemoveMember={onRemoveMember} />
                ))}
              </div>
            )}
          </section>

          <section id="team-nodes-section" className="team-subsection">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3 team-subsection-header">
              <div>
                <h6 className="text-info mb-0">노드 공유 설정</h6>
                <small className="text-secondary team-mobile-muted">팀원이 접근할 노드를 선택합니다.</small>
              </div>
              {canManageNodes && (
                <div className="team-node-actions">
                  <button type="button" className="btn btn-outline-info btn-sm team-save-button" onClick={onSaveTeamNodes} disabled={savingTeamNodes}>
                    <i className="bi bi-save me-1"></i>{savingTeamNodes ? '저장 중...' : '공유 노드 저장'}
                  </button>
                </div>
              )}
            </div>

            {!canManageNodes ? (
              <div className="team-empty-state">
                <i className="bi bi-shield-lock text-secondary"></i>
                <span>공유 노드 설정은 팀 소유자만 변경할 수 있습니다.</span>
              </div>
            ) : nodeOptions.length === 0 ? (
              <div className="team-empty-state">
                <i className="bi bi-hdd-network text-secondary"></i>
                <span>공유할 수 있는 내 노드가 없습니다.</span>
              </div>
            ) : (
              <div className="team-node-list">
                {nodeOptions.map(option => (
                  <TeamNodeOption
                    key={option.nodeId}
                    option={option}
                    checked={selectedNodeIds.has(option.nodeId)}
                    onToggleNodeShare={onToggleNodeShare}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default TeamDetailPanel;
