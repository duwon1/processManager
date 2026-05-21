import { useMemo, useState } from 'react';
import { getRoleMeta } from '../../utils/teamMeta';

function TeamListPanel({ teams, selectedTeamId, onSelectTeam }) {
  const [search, setSearch] = useState('');
  const filteredTeams = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return teams;
    return teams.filter(team => String(team.name ?? '').toLowerCase().includes(keyword));
  }, [search, teams]);

  const renderTeamButton = (team) => {
    const roleMeta = getRoleMeta(team.role);
    const active = selectedTeamId === team.id;

    return (
      <button
        type="button"
        key={team.id}
        className={`team-v2-list-item ${active ? 'team-v2-list-item-active' : ''}`}
        onClick={() => onSelectTeam(team.id)}
        aria-pressed={active}
      >
        <span className="team-v2-list-copy">
          <span className="team-v2-list-name">{team.name}</span>
          <span className="team-v2-list-meta">
            <span className={`badge ${roleMeta.className}`}>{roleMeta.label}</span>
            <span>멤버 {team.memberCount ?? 0}</span>
            <span>노드 {team.nodeCount ?? 0}</span>
          </span>
        </span>
        {active && <i className="bi bi-check2 team-v2-list-check" aria-hidden="true"></i>}
      </button>
    );
  };

  return (
    <section id="team-list-section" className="team-v2-navigator">
      <div className="team-v2-panel-heading">
        <div>
          <div className="team-v2-section-title">팀</div>
          <div className="team-v2-section-subtitle">소유하거나 참여 중인 팀</div>
        </div>
        <span className="team-v2-count-badge">{teams.length}</span>
      </div>

      <input
        type="search"
        className="form-control form-control-sm team-v2-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="팀 검색"
      />

      {teams.length === 0 ? (
        <div className="team-v2-empty team-v2-empty-list">
          <span className="team-v2-empty-icon">
            <i className="bi bi-people"></i>
          </span>
          <span className="team-v2-empty-title">아직 팀이 없습니다</span>
          <span className="team-v2-empty-text">팀을 만들거나 초대를 수락하면 이곳에 표시됩니다.</span>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="team-v2-empty team-v2-empty-search">
          <span className="team-v2-empty-icon">
            <i className="bi bi-search"></i>
          </span>
          <span className="team-v2-empty-title">검색 결과가 없습니다</span>
          <span className="team-v2-empty-text">다른 팀 이름으로 다시 검색해보세요.</span>
        </div>
      ) : (
        <div className="team-v2-list">
          {filteredTeams.map(renderTeamButton)}
        </div>
      )}
    </section>
  );
}

export default TeamListPanel;
