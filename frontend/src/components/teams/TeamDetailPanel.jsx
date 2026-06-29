import { useEffect, useMemo, useState } from 'react';
import { getNodeStatusMeta } from '../../utils/nodeStatus';
import { getMemberStatusMeta, getRoleMeta } from '../../utils/teamMeta';
import { submitOnEnter } from '../../utils/submitOnEnter';

const PERMISSION_ITEMS = [
  { key: 'canViewMonitoring', label: '모니터링', icon: 'bi-activity' },
  { key: 'canUseTerminal', label: '터미널', icon: 'bi-terminal' },
  { key: 'canControlProcesses', label: '프로세스', icon: 'bi-cpu' },
  { key: 'canControlServices', label: '서비스', icon: 'bi-gear' },
];

const PERMISSION_GROUPS = [
  {
    title: '조회',
    items: PERMISSION_ITEMS.filter(item => ['canViewMonitoring'].includes(item.key)),
  },
  {
    title: '제어',
    items: PERMISSION_ITEMS.filter(item => ['canUseTerminal', 'canControlProcesses', 'canControlServices'].includes(item.key)),
  },
];

const ALL_PERMISSION_PAYLOAD = {
  canViewMonitoring: true,
  canUseTerminal: true,
  canControlProcesses: true,
  canControlServices: true,
};

const TABS = [
  { key: 'members', label: '멤버' },
  { key: 'nodes', label: '노드' },
  { key: 'settings', label: '설정' },
];

const toPermissionPayload = (member, forceAll = false) => ({
  canViewMonitoring: forceAll || Boolean(member.canViewMonitoring),
  canUseTerminal: forceAll || Boolean(member.canUseTerminal),
  canControlProcesses: forceAll || Boolean(member.canControlProcesses),
  canControlServices: forceAll || Boolean(member.canControlServices),
});

const getPermissionSummary = (member) => {
  if (member.role === 'OWNER') {
    return {
      title: '전체 권한',
      detail: '소유자는 모든 기능을 사용할 수 있습니다.',
    };
  }

  const current = toPermissionPayload(member);
  const readCount = Number(current.canViewMonitoring);
  const controlCount = Number(current.canUseTerminal) + Number(current.canControlProcesses) + Number(current.canControlServices);
  const enabledLabels = PERMISSION_ITEMS
    .filter(item => current[item.key])
    .map(item => item.label);

  return {
    title: readCount || controlCount ? `읽기 ${readCount} · 제어 ${controlCount}` : '권한 없음',
    detail: enabledLabels.length ? enabledLabels.join(' · ') : '접근 권한이 없습니다.',
  };
};

function TeamMemberRow({
  canManagePermissions,
  canSelect,
  isEditing,
  isSelected,
  member,
  permissionSaving,
  onEditPermissions,
  onRemoveMember,
  onToggleSelect,
}) {
  const roleMeta = getRoleMeta(member.role);
  const statusMeta = getMemberStatusMeta(member.status);
  const isOwner = member.role === 'OWNER';
  const canEditPermissions = canManagePermissions && !isOwner;
  const permissionSummary = getPermissionSummary(member);

  return (
    <article className={`team-v2-member-row ${isEditing ? 'team-v2-member-row-selected' : ''}`}>
      <div className="team-v2-member-area team-v2-member-area-user">
        <span className="team-v2-member-area-label">멤버</span>
        <div className="team-v2-member-main">
          {canManagePermissions && (
            <label className="team-v2-member-check">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!canSelect || permissionSaving}
                onChange={() => onToggleSelect(member)}
                aria-label={`${member.email} 선택`}
              />
              <span aria-hidden="true"></span>
            </label>
          )}
          <span className="team-v2-member-avatar" aria-hidden="true">{(member.email || 'U')[0].toUpperCase()}</span>
          <span className="team-v2-member-copy">
            <span className="team-v2-member-email">{member.email}</span>
            <span className="team-v2-member-meta">
              <span className={`team-v2-member-role team-v2-member-role-${member.role?.toLowerCase() || 'member'}`}>{roleMeta.label}</span>
              <span className={`team-v2-member-status team-v2-member-status-${member.status?.toLowerCase() || 'unknown'}`}>{statusMeta.label}</span>
            </span>
          </span>
        </div>
      </div>

      <div className="team-v2-member-area team-v2-member-area-permissions">
        <span className="team-v2-member-area-label">권한</span>
        <div className="team-v2-permission-summary" aria-label={`${member.email} 권한 요약`}>
          <span className="team-v2-permission-summary-title">{permissionSummary.title}</span>
          <span className="team-v2-permission-summary-detail">{permissionSummary.detail}</span>
        </div>
      </div>

      <div className="team-v2-member-area team-v2-member-area-actions">
        <span className="team-v2-member-area-label">작업</span>
        <div className="team-v2-member-actions">
          {canEditPermissions && (
            <button
              type="button"
              className="btn btn-outline-info btn-sm team-v2-row-action"
              onClick={() => onEditPermissions(member)}
              disabled={permissionSaving}
              aria-label={`${member.email} 권한 변경`}
            >
              {permissionSaving ? '저장 중' : '변경'}
            </button>
          )}
          {member.role !== 'OWNER' && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm team-v2-row-action"
              onClick={() => onRemoveMember(member)}
              aria-label={`${member.email} 제거`}
            >
              제거
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PermissionEditor({
  draft,
  member,
  onClose,
  onSave,
  onSelectAll,
  onTogglePermission,
  saving,
  title = '권한 변경',
}) {
  if (!member) return null;

  return (
    <aside className="team-v2-permission-editor" role="dialog" aria-label={`${member.email} 권한 변경`}>
      <div className="team-v2-permission-editor-head">
        <div className="min-w-0">
          <div className="team-v2-section-title">{title}</div>
          <div className="team-v2-section-subtitle text-truncate">{member.email}</div>
        </div>
        <div className="team-v2-permission-editor-tools">
          <button
            type="button"
            className="team-v2-permission-text-action"
            onClick={onSelectAll}
            disabled={saving}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm team-v2-icon-button"
            onClick={onClose}
            aria-label="권한 편집 닫기"
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div className="team-v2-permission-editor-body">
        {PERMISSION_GROUPS.map(group => (
          <section className="team-v2-permission-group" key={group.title}>
            <div className="team-v2-permission-group-title">{group.title}</div>
            <div className="team-v2-permission-toggle-list">
              {group.items.map(item => {
                const active = Boolean(draft[item.key]);
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={`team-v2-permission-toggle ${active ? 'team-v2-permission-toggle-active' : ''}`}
                    onClick={() => onTogglePermission(item.key)}
                    disabled={saving}
                    aria-pressed={active}
                  >
                    <span className="team-v2-permission-toggle-main">
                      <i className={`bi ${item.icon}`} aria-hidden="true"></i>
                      <span>{item.label}</span>
                    </span>
                    <span className="team-v2-permission-toggle-state">{active ? '허용' : '없음'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="team-v2-permission-editor-actions">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={saving}>
          취소
        </button>
        <button type="button" className="btn btn-info btn-sm" onClick={onSave} disabled={saving}>
          {saving ? '저장 중' : '저장'}
        </button>
      </div>
    </aside>
  );
}

function TeamNodeList({ nodeOptions, savingTeamNodes, selectedNodeIds, onToggleNodeShare }) {
  return (
    <div className="team-v2-node-list">
      {nodeOptions.map(option => {
        const checked = selectedNodeIds.has(option.nodeId);
        const statusMeta = getNodeStatusMeta(option.status);

        return (
          <button
            type="button"
            key={option.nodeId}
            className={`team-v2-node-row ${checked ? 'team-v2-node-row-active' : ''}`}
            onClick={() => onToggleNodeShare(option.nodeId)}
            disabled={savingTeamNodes}
            aria-pressed={checked}
          >
            <span className={`team-v2-dot ${statusMeta.dotClass}`}></span>
            <span className="team-v2-node-row-copy">
              <span>{option.nodeName}</span>
              <small>
                <span className={statusMeta.textClass}>{statusMeta.label}</span>
                <span>{option.osType || '-'}</span>
              </small>
            </span>
            <span className={`team-v2-node-row-state ${checked ? 'team-v2-node-row-state-on' : 'team-v2-node-row-state-off'}`}>
              {checked ? '공유' : '미공유'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TeamDetailPanel({
  activeMemberCount,
  canManageMembers,
  canManageNodes,
  canManagePermissions,
  inviteEmail,
  invitingMember = false,
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
  onLeaveTeam,
  onRenameTeam,
  onSaveTeamNodes,
  onToggleNodeShare,
  onUpdateBulkMemberPermissions,
  onUpdateMemberPermissions,
  savingMemberPermissionIds = new Set(),
}) {
  const [activeTab, setActiveTab] = useState('members');
  const [editingPermissionMemberId, setEditingPermissionMemberId] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState(toPermissionPayload({}));
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedPermissionMemberIds, setSelectedPermissionMemberIds] = useState(new Set());
  const [savingPermissionEditor, setSavingPermissionEditor] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setNameDraft(selectedTeam?.name || '');
  }, [selectedTeam?.id, selectedTeam?.name]);

  useEffect(() => {
    setEditingPermissionMemberId(null);
    setMemberSearch('');
    setSelectedPermissionMemberIds(new Set());
  }, [selectedTeam?.id]);

  const editingPermissionMember = teamMembers.find(member => member.id === editingPermissionMemberId) || null;
  const selectedPermissionMembers = teamMembers.filter(member => selectedPermissionMemberIds.has(member.id) && member.role !== 'OWNER');
  const selectedPermissionCount = selectedPermissionMembers.length;
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredTeamMembers = useMemo(() => {
    if (!normalizedMemberSearch) return teamMembers;

    return teamMembers.filter(member => {
      const roleMeta = getRoleMeta(member.role);
      const statusMeta = getMemberStatusMeta(member.status);
      return [member.email, roleMeta.label, statusMeta.label]
        .some(value => String(value || '').toLowerCase().includes(normalizedMemberSearch));
    });
  }, [teamMembers, normalizedMemberSearch]);
  const editableFilteredMemberIds = filteredTeamMembers
    .filter(member => member.role !== 'OWNER')
    .map(member => member.id);
  const allFilteredMembersSelected = editableFilteredMemberIds.length > 0
    && editableFilteredMemberIds.every(id => selectedPermissionMemberIds.has(id));
  const permissionEditorTarget = selectedPermissionCount > 0
    ? { email: `선택 ${selectedPermissionCount}명` }
    : editingPermissionMember;

  useEffect(() => {
    if (!editingPermissionMemberId) return;
    if (!editingPermissionMember) {
      setEditingPermissionMemberId(null);
      return;
    }
    setPermissionDraft(toPermissionPayload(editingPermissionMember, editingPermissionMember.role === 'OWNER'));
  }, [
    editingPermissionMemberId,
    editingPermissionMember,
  ]);

  useEffect(() => {
    setSelectedPermissionMemberIds(previous => {
      if (previous.size === 0) return previous;

      const editableIds = new Set(teamMembers.filter(member => member.role !== 'OWNER').map(member => member.id));
      const next = new Set();
      previous.forEach(id => {
        if (editableIds.has(id)) {
          next.add(id);
        }
      });

      return next.size === previous.size ? previous : next;
    });
  }, [teamMembers]);

  if (!selectedTeam) {
    return (
      <section id="team-detail-section" className="team-v2-detail team-v2-empty-detail">
        <div className="team-v2-empty team-v2-empty-large">
          <i className="bi bi-layout-sidebar"></i>
          <span>팀을 선택하면 설정이 열립니다.</span>
        </div>
      </section>
    );
  }

  const selectedRoleMeta = getRoleMeta(selectedTeam.role);
  const canRenameTeam = selectedTeam.role === 'OWNER';
  const memberTotal = selectedTeam.memberCount ?? teamMembers.length;
  const metaSummary = `멤버 ${memberTotal}명 · 활성 ${activeMemberCount}명 · 초대 ${invitedMemberCount}명 · 노드 ${sharedNodeCount}개`;

  const openPermissionEditor = (member) => {
    if (!canManagePermissions || member.role === 'OWNER') return;
    setSelectedPermissionMemberIds(new Set());
    setEditingPermissionMemberId(member.id);
    setPermissionDraft(toPermissionPayload(member));
  };

  const closePermissionEditor = () => {
    if (savingPermissionEditor) return;
    setEditingPermissionMemberId(null);
    setSelectedPermissionMemberIds(new Set());
  };

  const togglePermissionMember = (member) => {
    if (!canManagePermissions || member.role === 'OWNER' || savingPermissionEditor) return;
    const nextSelected = !selectedPermissionMemberIds.has(member.id);
    if (nextSelected && selectedPermissionMemberIds.size === 0) {
      setPermissionDraft(toPermissionPayload(member));
    }
    setEditingPermissionMemberId(null);
    setSelectedPermissionMemberIds(previous => {
      const next = new Set(previous);
      if (next.has(member.id)) {
        next.delete(member.id);
      } else {
        next.add(member.id);
      }
      return next;
    });
  };

  const toggleFilteredPermissionMembers = () => {
    if (!canManagePermissions || savingPermissionEditor || editableFilteredMemberIds.length === 0) return;
    if (!allFilteredMembersSelected && selectedPermissionMemberIds.size === 0) {
      const firstEditableMember = filteredTeamMembers.find(member => member.role !== 'OWNER');
      setPermissionDraft(toPermissionPayload(firstEditableMember || {}));
    }
    setEditingPermissionMemberId(null);
    setSelectedPermissionMemberIds(previous => {
      const next = new Set(previous);
      if (allFilteredMembersSelected) {
        editableFilteredMemberIds.forEach(id => next.delete(id));
      } else {
        editableFilteredMemberIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const selectAllPermissions = () => {
    setPermissionDraft({ ...ALL_PERMISSION_PAYLOAD });
  };

  const togglePermissionDraft = (key) => {
    setPermissionDraft(previous => {
      const next = { ...previous, [key]: !previous[key] };

      if (key === 'canViewMonitoring' && !next.canViewMonitoring) {
        next.canUseTerminal = false;
        next.canControlProcesses = false;
        next.canControlServices = false;
      }

      if (key !== 'canViewMonitoring' && next[key]) {
        next.canViewMonitoring = true;
      }

      return next;
    });
  };

  const savePermissionEditor = async () => {
    if ((!editingPermissionMember && selectedPermissionCount === 0) || savingPermissionEditor) return;
    setSavingPermissionEditor(true);
    try {
      const saved = selectedPermissionCount > 0
        ? await onUpdateBulkMemberPermissions?.(selectedPermissionMembers, permissionDraft)
        : await onUpdateMemberPermissions?.(editingPermissionMember, permissionDraft);
      if (saved) {
        setEditingPermissionMemberId(null);
        setSelectedPermissionMemberIds(new Set());
      }
    } finally {
      setSavingPermissionEditor(false);
    }
  };

  const submitNameEdit = async (event) => {
    event.preventDefault();
    if (!canRenameTeam || savingName) return;
    setSavingName(true);
    await onRenameTeam?.(selectedTeam, nameDraft);
    setSavingName(false);
  };

  const renderMembers = () => {
    if (!canManageMembers) {
      return (
        <div className="team-v2-empty">
          <i className="bi bi-lock"></i>
          <span>팀 관리 권한이 없습니다. 공유 노드는 사이드바에서 접근할 수 있습니다.</span>
        </div>
      );
    }

    if (loadingTeamDetail) {
      return (
        <div className="team-v2-empty">
          <span className="spinner-border spinner-border-sm text-info"></span>
          <span>팀 정보를 불러오는 중...</span>
        </div>
      );
    }

    return (
      <section className="team-v2-tab-panel">
        <form className="team-v2-inline-form" onSubmit={onInviteMember}>
          <input
            className="form-control form-control-sm"
            id="team-invite-email"
            type="email"
            inputMode="email"
            value={inviteEmail}
            onChange={(e) => onInviteEmailChange(e.target.value)}
            onKeyDown={submitOnEnter}
            disabled={invitingMember}
            placeholder="초대할 이메일"
          />
          <button type="submit" className="btn btn-info btn-sm" disabled={invitingMember}>
            {invitingMember ? '초대 중' : '초대'}
          </button>
        </form>

        {teamMembers.length === 0 ? (
          <div className="team-v2-empty">
            <i className="bi bi-person-lines-fill"></i>
            <span>멤버가 없습니다.</span>
          </div>
        ) : (
          <>
            <div className="team-v2-member-toolbar">
              <label className="team-v2-member-search">
                <i className="bi bi-search" aria-hidden="true"></i>
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="멤버 검색"
                  aria-label="멤버 검색"
                />
              </label>
              {canManagePermissions && (
                <div className="team-v2-member-bulkbar">
                  <span>선택 {selectedPermissionCount}명</span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={toggleFilteredPermissionMembers}
                    disabled={editableFilteredMemberIds.length === 0 || savingPermissionEditor}
                  >
                    {allFilteredMembersSelected ? '선택 해제' : '전체 선택'}
                  </button>
                </div>
              )}
            </div>

          {filteredTeamMembers.length === 0 ? (
            <div className="team-v2-empty">
              <i className="bi bi-search"></i>
              <span>검색 결과가 없습니다.</span>
            </div>
          ) : (
          <div className="team-v2-member-workspace">
            <div className="team-v2-member-list">
              <div className="team-v2-member-list-head" aria-hidden="true">
                <span>멤버</span>
                <span>권한</span>
                <span>작업</span>
              </div>
              {filteredTeamMembers.map(member => (
                <TeamMemberRow
                  key={member.id}
                  canManagePermissions={canManagePermissions}
                  canSelect={canManagePermissions && member.role !== 'OWNER'}
                  isEditing={member.id === editingPermissionMemberId}
                  isSelected={selectedPermissionMemberIds.has(member.id)}
                  member={member}
                  permissionSaving={
                    savingMemberPermissionIds.has(member.id)
                    || (savingPermissionEditor && (member.id === editingPermissionMemberId || selectedPermissionMemberIds.has(member.id)))
                  }
                  onEditPermissions={openPermissionEditor}
                  onRemoveMember={onRemoveMember}
                  onToggleSelect={togglePermissionMember}
                />
              ))}
            </div>
          </div>
          )}
          </>
        )}
      </section>
    );
  };

  const renderNodes = () => {
    if (!canManageNodes) {
      return (
        <div className="team-v2-empty">
          <i className="bi bi-shield-lock"></i>
          <span>공유 노드 설정은 팀 소유자만 변경할 수 있습니다.</span>
        </div>
      );
    }

    if (nodeOptions.length === 0) {
      return (
        <div className="team-v2-empty">
          <i className="bi bi-hdd-network"></i>
          <span>공유할 수 있는 내 노드가 없습니다.</span>
        </div>
      );
    }

    return (
      <section className="team-v2-tab-panel">
        <div className="team-v2-tab-actionbar">
          <span>선택된 노드 {selectedNodeIds.size}개</span>
          <button type="button" className="btn btn-outline-info btn-sm" onClick={onSaveTeamNodes} disabled={savingTeamNodes}>
            {savingTeamNodes ? '저장 중' : '저장'}
          </button>
        </div>
        <TeamNodeList
          nodeOptions={nodeOptions}
          savingTeamNodes={savingTeamNodes}
          selectedNodeIds={selectedNodeIds}
          onToggleNodeShare={onToggleNodeShare}
        />
      </section>
    );
  };

  const renderSettings = () => {
    if (!canRenameTeam) {
      return (
        <section className="team-v2-tab-panel">
          <div className="team-v2-settings-row team-v2-settings-danger">
            <div>
              <div className="team-v2-section-title">팀 탈퇴</div>
              <div className="team-v2-section-subtitle">탈퇴하면 이 팀의 공유 노드에 접근할 수 없습니다.</div>
            </div>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => onLeaveTeam?.(selectedTeam)}
            >
              탈퇴
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="team-v2-tab-panel">
        <form className="team-v2-settings-row" onSubmit={submitNameEdit}>
          <div>
            <div className="team-v2-section-title">표시 이름</div>
            <div className="team-v2-section-subtitle">팀 목록과 사이드바에 표시되는 이름입니다.</div>
          </div>
          <div className="team-v2-settings-control">
            <input
              className="form-control form-control-sm"
              value={nameDraft}
              maxLength={100}
              disabled={savingName}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={submitOnEnter}
              aria-label="팀 이름"
            />
            <button type="submit" className="btn btn-info btn-sm" disabled={savingName}>
              저장
            </button>
          </div>
        </form>

        <div className="team-v2-settings-row team-v2-settings-danger">
          <div>
            <div className="team-v2-section-title">팀 삭제</div>
            <div className="team-v2-section-subtitle">멤버와 공유 노드 연결이 함께 정리됩니다.</div>
          </div>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={() => onDeleteTeam(selectedTeam)}
          >
            삭제
          </button>
        </div>
      </section>
    );
  };

  return (
    <section id="team-detail-section" className="team-v2-detail">
      <div className="team-v2-detail-hero">
        <div className="team-v2-detail-title-copy">
          <div className="team-v2-detail-name-line">
            <h2>{selectedTeam.name}</h2>
            <span className={`badge ${selectedRoleMeta.className}`}>{selectedRoleMeta.label}</span>
          </div>
          <div className="team-v2-detail-meta">{metaSummary}</div>
        </div>
      </div>

      <div className="team-v2-tabs" role="tablist" aria-label="팀 상세">
        {TABS.map(tab => (
          <button
            type="button"
            key={tab.key}
            className={`team-v2-tab ${activeTab === tab.key ? 'team-v2-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'members' && permissionEditorTarget && (
        <div className="team-v2-permission-modal">
          <PermissionEditor
            draft={permissionDraft}
            member={permissionEditorTarget}
            onClose={closePermissionEditor}
            onSave={savePermissionEditor}
            onSelectAll={selectAllPermissions}
            onTogglePermission={togglePermissionDraft}
            saving={savingPermissionEditor || Boolean(editingPermissionMember && savingMemberPermissionIds.has(editingPermissionMember.id))}
            title={selectedPermissionCount > 0 ? '일괄 권한 변경' : '권한 변경'}
          />
        </div>
      )}

      {activeTab === 'members' && renderMembers()}
      {activeTab === 'nodes' && renderNodes()}
      {activeTab === 'settings' && renderSettings()}
    </section>
  );
}

export default TeamDetailPanel;
