import { useState } from 'react';
import { getNodeStatusMeta } from '../../utils/nodeStatus';
import { getMemberStatusMeta, getRoleMeta } from '../../utils/teamMeta';

const PERMISSION_ITEMS = [
  { key: 'canViewMonitoring', label: '조회', title: '모니터링 조회', icon: 'bi-eye' },
  { key: 'canViewFiles', label: '파일', title: '파일 목록 조회', icon: 'bi-folder2-open' },
  { key: 'canUseTerminal', label: '쉘', title: '터미널 사용', icon: 'bi-terminal' },
  { key: 'canControlProcesses', label: '종료', title: '프로세스 종료', icon: 'bi-cpu' },
  { key: 'canControlServices', label: '서비스', title: '서비스 제어', icon: 'bi-toggles' },
];

const EMPTY_PERMISSIONS = {
  canViewMonitoring: true,
  canViewFiles: false,
  canUseTerminal: false,
  canControlProcesses: false,
  canControlServices: false,
};

const PERMISSION_PRESETS = [
  {
    key: 'monitor',
    label: '조회만',
    permissions: EMPTY_PERMISSIONS,
  },
  {
    key: 'files',
    label: '파일 확인',
    permissions: {
      ...EMPTY_PERMISSIONS,
      canViewFiles: true,
    },
  },
  {
    key: 'operate',
    label: '운영 제어',
    permissions: {
      ...EMPTY_PERMISSIONS,
      canControlProcesses: true,
      canControlServices: true,
    },
  },
  {
    key: 'full',
    label: '전체',
    permissions: {
      canViewMonitoring: true,
      canViewFiles: true,
      canUseTerminal: true,
      canControlProcesses: true,
      canControlServices: true,
    },
  },
];

const toPermissionPayload = (member, forceAll = false) => ({
  canViewMonitoring: forceAll || Boolean(member.canViewMonitoring),
  canViewFiles: forceAll || Boolean(member.canViewFiles),
  canUseTerminal: forceAll || Boolean(member.canUseTerminal),
  canControlProcesses: forceAll || Boolean(member.canControlProcesses),
  canControlServices: forceAll || Boolean(member.canControlServices),
});

const samePermissions = (left, right) => PERMISSION_ITEMS.every(item => Boolean(left[item.key]) === Boolean(right[item.key]));

const resolvePermissionPresetKey = (member, isOwner) => {
  const current = toPermissionPayload(member, isOwner);
  return PERMISSION_PRESETS.find(preset => samePermissions(current, preset.permissions))?.key ?? 'custom';
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
  const selectedPresetKey = resolvePermissionPresetKey(member, isOwner);

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

  const applyPreset = (key) => {
    if (!canEditPermissions || permissionSaving || key === 'custom' || key === selectedPresetKey) return;
    const preset = PERMISSION_PRESETS.find(item => item.key === key);
    if (preset) {
      onUpdateMemberPermissions?.(member, preset.permissions);
    }
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
        <div className="team-permission-preset-row">
          <span className="team-permission-preset-label">프리셋</span>
          <select
            className="form-select form-select-sm team-permission-preset-select"
            value={selectedPresetKey}
            disabled={!canEditPermissions || permissionSaving}
            onChange={(event) => applyPreset(event.target.value)}
            aria-label={`${member.email} 권한 프리셋`}
          >
            {selectedPresetKey === 'custom' && <option value="custom">직접 설정</option>}
            {PERMISSION_PRESETS.map(preset => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
        </div>
        <div className="team-permission-toggle-grid" aria-label={`${member.email} 권한`}>
          {PERMISSION_ITEMS.map(item => {
            const active = isOwner || Boolean(member[item.key]);
            return (
              <button
                type="button"
                key={item.key}
                className={`team-permission-toggle ${active ? 'team-permission-toggle-active' : ''}`}
                disabled={!canEditPermissions || permissionSaving}
                onClick={() => togglePermission(item.key)}
                title={item.title}
                aria-label={`${member.email} ${item.title}`}
                aria-pressed={active}
              >
                <i className={`bi ${item.icon}`}></i>
                <span>{item.label}</span>
              </button>
            );
          })}
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
