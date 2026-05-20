import { useState } from 'react';
import { getNodeStatusMeta } from '../../utils/nodeStatus';
import { getMemberStatusMeta, getRoleMeta } from '../../utils/teamMeta';

const PERMISSION_ITEMS = [
  { key: 'canViewMonitoring', label: '모니터링', description: '대시보드와 상태 조회', title: '모니터링 조회', icon: 'bi-speedometer2' },
  { key: 'canViewFiles', label: '파일 관리', description: '파일 목록 조회', title: '파일 관리', icon: 'bi-folder2-open' },
  { key: 'canUseTerminal', label: '터미널', description: '터미널 접속과 명령 입력', title: '터미널 사용', icon: 'bi-terminal' },
  { key: 'canControlProcesses', label: '작업관리자', description: '프로세스 종료 제어', title: '작업관리자 제어', icon: 'bi-activity' },
  { key: 'canControlServices', label: '서비스', description: '서비스 시작/중지 제어', title: '서비스 제어', icon: 'bi-toggles' },
];

const toPermissionPayload = (member, forceAll = false) => ({
  canViewMonitoring: forceAll || Boolean(member.canViewMonitoring),
  canViewFiles: forceAll || Boolean(member.canViewFiles),
  canUseTerminal: forceAll || Boolean(member.canUseTerminal),
  canControlProcesses: forceAll || Boolean(member.canControlProcesses),
  canControlServices: forceAll || Boolean(member.canControlServices),
});

const getPermissionCount = (member, isOwner) => {
  const current = toPermissionPayload(member, isOwner);
  return PERMISSION_ITEMS.filter(item => current[item.key]).length;
};

const getPermissionSummary = (member, isOwner) => {
  if (isOwner) return '전체 권한';
  const current = toPermissionPayload(member);
  const enabledLabels = PERMISSION_ITEMS
    .filter(item => current[item.key])
    .map(item => item.label);
  return enabledLabels.length ? enabledLabels.join(', ') : '권한 없음';
};

function TeamMemberPermissionRow({
  canManagePermissions,
  member,
  permissionSaving,
  onRemoveMember,
  onUpdateMemberPermissions,
}) {
  const roleMeta = getRoleMeta(member.role);
  const statusMeta = getMemberStatusMeta(member.status);
  const isOwner = member.role === 'OWNER';
  const canEditPermissions = canManagePermissions && !isOwner;
  const permissionCount = getPermissionCount(member, isOwner);
  const permissionSummary = getPermissionSummary(member, isOwner);

  const togglePermission = (key) => {
    if (!canEditPermissions || permissionSaving) return;
    const next = toPermissionPayload(member);
    next[key] = !next[key];
    if (key === 'canViewMonitoring' && !next.canViewMonitoring) {
      next.canViewFiles = false;
      next.canUseTerminal = false;
      next.canControlProcesses = false;
      next.canControlServices = false;
    }
    if (key !== 'canViewMonitoring' && next[key]) {
      next.canViewMonitoring = true;
    }
    onUpdateMemberPermissions?.(member, next);
  };

  return (
    <div className="team-data-row team-member-permission-row">
      <div className="d-flex align-items-center gap-2 min-w-0 team-member-main">
        <div className="team-member-avatar" aria-hidden="true">{(member.email || 'U')[0].toUpperCase()}</div>
        <div className="min-w-0 flex-grow-1">
          <div className="text-light fw-semibold text-truncate">{member.email}</div>
          <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
            <span className={`badge ${roleMeta.className}`}>{roleMeta.label}</span>
            <span className={`badge ${statusMeta.className}`}>{statusMeta.label}</span>
          </div>
        </div>
      </div>
      <div className="team-permission-area">
        <div className="dropdown team-permission-dropdown">
          <button
            type="button"
            className="btn btn-sm dropdown-toggle team-permission-summary"
            data-bs-toggle="dropdown"
            data-bs-auto-close="outside"
            data-bs-boundary="viewport"
            aria-expanded="false"
            aria-label={`${member.email} 권한 설정`}
          >
            <span className="team-permission-summary-main">
              <span className="team-permission-summary-icon">
                <i className="bi bi-shield-check"></i>
              </span>
              <span className="team-permission-summary-copy">
                <span className="team-permission-summary-title">{isOwner ? '전체 권한' : '권한 설정'}</span>
                <span className="team-permission-summary-subtitle">{permissionSummary}</span>
              </span>
            </span>
            <span className="team-permission-count">{permissionCount}/{PERMISSION_ITEMS.length}</span>
          </button>
          <div className="dropdown-menu dropdown-menu-dark team-permission-menu">
            <div className="team-permission-menu-header">
              <span className="text-info fw-semibold">권한 설정</span>
              <small className="text-secondary text-truncate">{permissionSummary}</small>
            </div>
            {PERMISSION_ITEMS.map(item => {
              const active = isOwner || Boolean(member[item.key]);
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`team-permission-option ${active ? 'team-permission-option-active' : ''}`}
                  disabled={!canEditPermissions || permissionSaving}
                  onClick={() => togglePermission(item.key)}
                  title={item.title}
                  aria-label={`${member.email} ${item.title}`}
                  aria-pressed={active}
                >
                  <span className="team-permission-option-icon">
                    <i className={`bi ${item.icon}`}></i>
                  </span>
                  <span className="team-permission-option-copy">
                    <span className="team-permission-option-label">{item.label}</span>
                    <span className="team-permission-option-desc">{item.description}</span>
                  </span>
                  <span className={`badge ${active ? 'text-bg-info' : 'text-bg-secondary'} team-permission-option-state`}>
                    {active ? '허용' : '차단'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="d-flex align-items-center justify-content-end gap-2 team-member-actions">
        {permissionSaving && <span className="spinner-border spinner-border-sm text-info"></span>}
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
    </div>
  );
}

function TeamNodeDropdown({ nodeOptions, savingTeamNodes, selectedNodeIds, onToggleNodeShare }) {
  const selectedOptions = nodeOptions.filter(option => selectedNodeIds.has(option.nodeId));
  const selectedCount = selectedOptions.length;
  const selectedSummary = selectedCount > 0
    ? selectedOptions.map(option => option.nodeName).join(', ')
    : '공유할 노드를 선택하세요';

  return (
    <div className="dropdown team-node-dropdown">
      <button
        type="button"
        className="btn btn-sm dropdown-toggle team-node-select-summary"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        data-bs-boundary="viewport"
        aria-expanded="false"
        aria-label="공유 노드 선택"
        disabled={savingTeamNodes}
      >
        <span className="team-node-select-main">
          <span className="team-node-select-icon">
            <i className="bi bi-hdd-network"></i>
          </span>
          <span className="team-node-select-copy">
            <span className="team-node-select-title">공유 노드 선택</span>
            <span className="team-node-select-subtitle">{selectedSummary}</span>
          </span>
        </span>
        <span className="team-node-select-count">{selectedCount}/{nodeOptions.length}</span>
      </button>
      <div className="dropdown-menu dropdown-menu-dark team-node-select-menu">
        <div className="team-node-select-menu-header">
          <span className="text-info fw-semibold">팀에 공유할 노드</span>
          <small className="text-secondary text-truncate">{selectedSummary}</small>
        </div>
        {nodeOptions.map(option => {
          const checked = selectedNodeIds.has(option.nodeId);
          const statusMeta = getNodeStatusMeta(option.status);
          return (
            <button
              type="button"
              key={option.nodeId}
              className={`team-node-select-option ${checked ? 'team-node-select-option-active' : ''}`}
              onClick={() => onToggleNodeShare(option.nodeId)}
              aria-label={`${option.nodeName} 공유 ${checked ? '해제' : '선택'}`}
              aria-pressed={checked}
            >
              <span className="team-node-select-option-check">
                <i className={`bi ${checked ? 'bi-check-lg' : 'bi-plus-lg'}`}></i>
              </span>
              <span className="team-node-select-option-copy">
                <span className="team-node-select-option-name">{option.nodeName}</span>
                <span className="team-node-select-option-meta">
                  <span className={`rounded-circle ${statusMeta.dotClass}`} style={{ width: 7, height: 7 }}></span>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                  <span className="text-secondary text-truncate">{option.osType || '-'}</span>
                </span>
              </span>
              <span className={`badge ${checked ? 'text-bg-info' : 'text-bg-secondary'} team-node-select-option-state`}>
                {checked ? '공유' : '미공유'}
              </span>
            </button>
          );
        })}
      </div>
      <small className="text-secondary d-block mt-2 team-node-select-help">
        선택 후 저장을 눌러 팀 노드 공유를 적용합니다.
      </small>
      {selectedCount > 0 && (
        <div className="team-node-selected-preview" aria-label="선택된 공유 노드">
          {selectedOptions.map(option => (
            <span key={option.nodeId} className="badge text-bg-info text-truncate">{option.nodeName}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamDetailPanel({
  activeMemberCount,
  canManageMembers,
  canManageNodes,
  canManagePermissions,
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
  onUpdateMemberPermissions,
  savingMemberPermissionIds = new Set(),
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
                <small className="text-secondary team-mobile-muted">가입된 사용자 이메일만 초대합니다.</small>
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
                  <TeamMemberPermissionRow
                    key={member.id}
                    canManagePermissions={canManagePermissions}
                    member={member}
                    permissionSaving={savingMemberPermissionIds.has(member.id)}
                    onRemoveMember={onRemoveMember}
                    onUpdateMemberPermissions={onUpdateMemberPermissions}
                  />
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
              <TeamNodeDropdown
                nodeOptions={nodeOptions}
                savingTeamNodes={savingTeamNodes}
                selectedNodeIds={selectedNodeIds}
                onToggleNodeShare={onToggleNodeShare}
              />
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default TeamDetailPanel;
