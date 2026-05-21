import { getRoleMeta } from '../../utils/teamMeta';

function TeamMobilePicker({ teams, selectedTeamId, onSelectTeam }) {
  if (teams.length === 0) return null;

  return (
    <section className="team-v2-mobile-picker d-lg-none">
      <label htmlFor="mobile-team-select">관리할 팀</label>
      <select
        id="mobile-team-select"
        className="form-select form-select-sm"
        value={selectedTeamId ?? ''}
        onChange={(e) => onSelectTeam(Number(e.target.value))}
      >
        {teams.map(team => {
          const roleMeta = getRoleMeta(team.role);
          return (
            <option key={team.id} value={team.id}>
              {team.name} · {roleMeta.label} · 노드 {team.nodeCount ?? 0}
            </option>
          );
        })}
      </select>
    </section>
  );
}

export default TeamMobilePicker;
