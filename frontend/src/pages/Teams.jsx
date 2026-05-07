import { useCallback, useEffect, useMemo, useState } from 'react';
import SideBar from '../components/SideBar';
import Header from '../components/Header';
import TeamCreatePanel from '../components/teams/TeamCreatePanel';
import TeamDetailPanel from '../components/teams/TeamDetailPanel';
import TeamInvitations from '../components/teams/TeamInvitations';
import TeamListPanel from '../components/teams/TeamListPanel';
import TeamMobilePicker from '../components/teams/TeamMobilePicker';
import { useAuthFetch } from '../hooks/useAuthFetch';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { readApiErrorMessage } from '../utils/apiErrorMessage';

function Teams() {
  const [teams, setTeams] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [nodeOptions, setNodeOptions] = useState([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [inviteEmail, setInviteEmail] = useState('');
  const [loadingTeamDetail, setLoadingTeamDetail] = useState(false);
  const [savingTeamNodes, setSavingTeamNodes] = useState(false);
  const [savingMemberPermissionIds, setSavingMemberPermissionIds] = useState(new Set());

  const authFetch = useAuthFetch();
  const dialog = useDialog();
  const { showToast } = useToast();

  const selectedTeam = useMemo(
    () => teams.find(team => team.id === selectedTeamId) || null,
    [teams, selectedTeamId]
  );
  const canManageMembers = selectedTeam && ['OWNER', 'ADMIN'].includes(selectedTeam.role);
  const canManageNodes = selectedTeam?.role === 'OWNER';
  const canManagePermissions = selectedTeam?.role === 'OWNER';
  const activeMemberCount = teamMembers.filter(member => member.status === 'ACTIVE').length;
  const invitedMemberCount = teamMembers.filter(member => member.status === 'INVITED').length;
  const sharedNodeCount = selectedNodeIds.size;

  const fetchTeams = useCallback(() => {
    return authFetch('/api/team/list')
      .then(res => res && res.ok ? res.json() : [])
      .then(data => {
        const nextTeams = Array.isArray(data) ? data : [];
        setTeams(nextTeams);
        setSelectedTeamId(prev => {
          if (prev && nextTeams.some(team => team.id === prev)) return prev;
          return nextTeams[0]?.id ?? null;
        });
        return nextTeams;
      })
      .catch(() => {
        setTeams([]);
        setSelectedTeamId(null);
        return [];
      });
  }, [authFetch]);

  const fetchInvitations = useCallback(() => {
    return authFetch('/api/team/invitations')
      .then(res => res && res.ok ? res.json() : [])
      .then(data => {
        const nextInvitations = Array.isArray(data) ? data : [];
        setInvitations(nextInvitations);
        return nextInvitations;
      })
      .catch(() => {
        setInvitations([]);
        return [];
      });
  }, [authFetch]);

  const refreshTeamDetail = useCallback((teamId, canLoadNodes) => {
    if (!teamId) {
      setTeamMembers([]);
      setNodeOptions([]);
      setSelectedNodeIds(new Set());
      setSavingMemberPermissionIds(new Set());
      return;
    }

    setLoadingTeamDetail(true);
    const memberRequest = authFetch(`/api/team/${teamId}/members`);
    const nodeRequest = canLoadNodes ? authFetch(`/api/team/${teamId}/node-options`) : Promise.resolve(null);

    Promise.all([memberRequest, nodeRequest])
      .then(async ([membersRes, nodesRes]) => {
        const members = membersRes?.ok ? await membersRes.json() : [];
        const options = nodesRes?.ok ? await nodesRes.json() : [];
        const nextOptions = Array.isArray(options) ? options : [];
        setTeamMembers(Array.isArray(members) ? members : []);
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
    fetchTeams();
    fetchInvitations();
  }, [fetchTeams, fetchInvitations]);

  useEffect(() => {
    if (selectedTeamId && canManageMembers) {
      refreshTeamDetail(selectedTeamId, canManageNodes);
    } else {
      setTeamMembers([]);
      setNodeOptions([]);
      setSelectedNodeIds(new Set());
      setSavingMemberPermissionIds(new Set());
    }
  }, [selectedTeamId, canManageMembers, canManageNodes, refreshTeamDetail]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    const name = teamName.trim();
    if (!name) {
      showToast('warning', '팀 이름을 입력해주세요.');
      return;
    }

    setCreatingTeam(true);
    try {
      const res = await authFetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: '' }),
      });
      if (res?.ok) {
        const created = await res.json();
        setTeamName('');
        await fetchTeams();
        setSelectedTeamId(created.id);
        showToast('success', `'${created.name}' 팀을 만들었습니다.`);
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '팀 생성에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '팀 생성에 실패했습니다.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (team) => {
    const confirmed = await dialog.confirm({
      title: '팀 삭제',
      message: `'${team.name}' 팀을 삭제할까요?`,
      detail: '팀 멤버와 공유 노드 연결이 함께 정리됩니다.',
      icon: 'bi-trash',
      confirmLabel: '팀 삭제',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/team/${team.id}`, { method: 'DELETE' });
      if (res?.ok) {
        await fetchTeams();
        showToast('success', `'${team.name}' 팀을 삭제했습니다.`);
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '팀 삭제에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '팀 삭제에 실패했습니다.');
    }
  };

  const handleRenameTeam = async (team, nextName) => {
    const name = nextName.trim();
    if (!name) {
      showToast('warning', '팀 이름을 입력해주세요.');
      return false;
    }
    if (name === team.name) {
      return true;
    }

    try {
      const res = await authFetch(`/api/team/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: team.description || '' }),
      });
      if (res?.ok) {
        const updated = await res.json();
        setTeams(prev => prev.map(item => item.id === updated.id ? { ...item, ...updated } : item));
        await fetchTeams();
        setSelectedTeamId(updated.id);
        showToast('success', `'${updated.name}' 팀 이름을 저장했습니다.`);
        return true;
      }
      if (res) {
        showToast('danger', await readApiErrorMessage(res, '팀 이름 저장에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '팀 이름 저장에 실패했습니다.');
    }
    return false;
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
        refreshTeamDetail(selectedTeam.id, canManageNodes);
        showToast('success', '초대 요청을 보냈습니다.');
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '초대 요청에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '초대 요청에 실패했습니다.');
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedTeam) return;
    const confirmed = await dialog.confirm({
      title: '멤버 제거',
      message: `${member.email} 사용자를 팀에서 제거할까요?`,
      detail: '제거된 사용자는 이 팀의 공유 노드에 접근할 수 없습니다.',
      icon: 'bi-person-dash',
      confirmLabel: '멤버 제거',
      confirmVariant: 'danger',
    });
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/team/${selectedTeam.id}/members/${member.id}`, { method: 'DELETE' });
      if (res?.ok) {
        refreshTeamDetail(selectedTeam.id, canManageNodes);
        await fetchTeams();
        showToast('success', '팀 멤버를 제거했습니다.');
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '팀 멤버 제거에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '팀 멤버 제거에 실패했습니다.');
    }
  };

  const handleUpdateMemberPermissions = async (member, permissions) => {
    if (!selectedTeam || !canManagePermissions) return;
    setSavingMemberPermissionIds(prev => new Set(prev).add(member.id));
    try {
      const res = await authFetch(`/api/team/${selectedTeam.id}/members/${member.id}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissions),
      });
      if (res?.ok) {
        const updated = await res.json();
        setTeamMembers(prev => prev.map(item => item.id === updated.id ? updated : item));
        showToast('success', '팀원 권한을 저장했습니다.');
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '팀원 권한 저장에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '팀원 권한 저장에 실패했습니다.');
    } finally {
      setSavingMemberPermissionIds(prev => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    }
  };

  const handleInvitation = async (invitation, action) => {
    try {
      const res = await authFetch(`/api/team/invitations/${invitation.id}/${action}`, { method: 'POST' });
      if (res?.ok) {
        await fetchInvitations();
        await fetchTeams();
        showToast('success', action === 'accept' ? '팀 초대를 수락했습니다.' : '팀 초대를 거절했습니다.');
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '초대 처리에 실패했습니다.'));
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
    if (!selectedTeam || !canManageNodes) return;
    setSavingTeamNodes(true);
    try {
      const res = await authFetch(`/api/team/${selectedTeam.id}/nodes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: Array.from(selectedNodeIds) }),
      });
      if (res?.ok) {
        const options = await res.json();
        const nextOptions = Array.isArray(options) ? options : [];
        setNodeOptions(nextOptions);
        setSelectedNodeIds(new Set(nextOptions.filter(option => option.shared).map(option => option.nodeId)));
        await fetchTeams();
        showToast('success', '공유 노드 설정을 저장했습니다.');
      } else if (res) {
        showToast('danger', await readApiErrorMessage(res, '공유 노드 저장에 실패했습니다.'));
      }
    } catch {
      showToast('danger', '공유 노드 저장에 실패했습니다.');
    } finally {
      setSavingTeamNodes(false);
    }
  };

  return (
    <div className="d-flex vh-100 overflow-hidden">
      <SideBar />

      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
        <Header title="팀 관리" />

        <main className="flex-grow-1 overflow-y-auto p-2 p-md-4">
          <div className="team-page-shell">
            <div className="team-page-header d-flex flex-column flex-lg-row align-items-lg-end justify-content-between gap-3 mb-3">
              <div>
                <h5 className="text-info mb-1">팀 관리</h5>
                <div className="text-secondary small team-page-copy">노드 공유, 멤버 초대, 초대 수락 상태를 한 화면에서 관리합니다.</div>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <span className="team-stat-pill"><i className="bi bi-people"></i> 팀 {teams.length}</span>
                <span className="team-stat-pill"><i className="bi bi-envelope"></i> 초대 {invitations.length}</span>
                <span className="team-stat-pill"><i className="bi bi-hdd-network"></i> 공유 {selectedTeam?.nodeCount ?? 0}</span>
              </div>
            </div>

            <TeamInvitations invitations={invitations} onInvitation={handleInvitation} />
            <TeamMobilePicker teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />

            <div className="team-workspace">
              <aside className="d-flex flex-column gap-3" style={{ minWidth: 0 }}>
                <TeamCreatePanel
                  teamName={teamName}
                  creatingTeam={creatingTeam}
                  onTeamNameChange={setTeamName}
                  onCreateTeam={handleCreateTeam}
                />
                <TeamListPanel teams={teams} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />
              </aside>

              <TeamDetailPanel
                key={selectedTeamId ?? 'empty-team'}
                activeMemberCount={activeMemberCount}
                canManageMembers={canManageMembers}
                canManageNodes={canManageNodes}
                canManagePermissions={canManagePermissions}
                inviteEmail={inviteEmail}
                invitedMemberCount={invitedMemberCount}
                loadingTeamDetail={loadingTeamDetail}
                nodeOptions={nodeOptions}
                savingTeamNodes={savingTeamNodes}
                selectedNodeIds={selectedNodeIds}
                selectedTeam={selectedTeam}
                sharedNodeCount={sharedNodeCount}
                teamMembers={teamMembers}
                onDeleteTeam={handleDeleteTeam}
                onInviteEmailChange={setInviteEmail}
                onInviteMember={handleInviteMember}
                onRemoveMember={handleRemoveMember}
                onRenameTeam={handleRenameTeam}
                onSaveTeamNodes={handleSaveTeamNodes}
                onToggleNodeShare={toggleNodeShare}
                onUpdateMemberPermissions={handleUpdateMemberPermissions}
                savingMemberPermissionIds={savingMemberPermissionIds}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Teams;
