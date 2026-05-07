import { getRoleMeta } from '../../utils/teamMeta';

function TeamListPanel({ teams, selectedTeamId, onSelectTeam }) {
  const renderTeamButton = (team) => {
    const roleMeta = getRoleMeta(team.role);
    const active = selectedTeamId === team.id;

    return (
      <button
        type="button"
        key={team.id}
        className={`team-list-item ${active ? 'team-list-item-active' : ''}`}
        onClick={() => onSelectTeam(team.id)}
        aria-pressed={active}
      >
        <span className="team-list-avatar" aria-hidden="true">{(team.name || 'T')[0].toUpperCase()}</span>
        <span className="min-w-0 flex-grow-1">
          <span className="d-flex align-items-center gap-2 mb-1 min-w-0">
            <span className="text-light fw-semibold text-truncate">{team.name}</span>
            <span className={`badge ${roleMeta.className} flex-shrink-0`}>{roleMeta.label}</span>
          </span>
          <span className="text-secondary small">멤버 {team.memberCount ?? 0}명 · 공유 노드 {team.nodeCount ?? 0}개</span>
        </span>
        {active ? (
          <span className="badge text-bg-info flex-shrink-0 team-selected-mark">
            <i className="bi bi-check2 me-1"></i>선택됨
          </span>
        ) : (
          <i className="bi bi-chevron-right text-secondary flex-shrink-0"></i>
        )}
      </button>
    );
  };

  return (
    <section id="team-list-section" className="team-surface team-list-panel p-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <div>
          <div className="text-light fw-semibold">팀 목록</div>
          <div className="text-secondary small team-mobile-muted">소유하거나 참여 중인 팀</div>
        </div>
        <span className="badge text-bg-secondary">{teams.length}</span>
      </div>

      {teams.length === 0 ? (
        <div className="team-empty-state">
          <i className="bi bi-people text-info"></i>
          <span>생성했거나 가입한 팀이 없습니다.</span>
        </div>
      ) : (
        <div className="d-flex flex-column gap-2 team-list-scroll">
          {teams.map(renderTeamButton)}
        </div>
      )}
    </section>
  );
}

export default TeamListPanel;
