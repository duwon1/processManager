import { useState } from 'react';

function TeamCreatePanel({ teamName, creatingTeam, onTeamNameChange, onCreateTeam }) {
  const [open, setOpen] = useState(false);

  return (
    <section id="team-create-section" className={`team-v2-create ${open ? 'team-v2-create-open' : ''}`}>
      <button
        type="button"
        className="team-v2-create-toggle"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
      >
        <span>팀 추가</span>
        <i className={`bi ${open ? 'bi-chevron-up' : 'bi-plus-lg'}`} aria-hidden="true"></i>
      </button>

      {open && (
        <form className="team-v2-create-form" onSubmit={onCreateTeam}>
          <input
            className="form-control form-control-sm"
            value={teamName}
            onChange={(e) => onTeamNameChange(e.target.value)}
            maxLength={100}
            placeholder="팀 이름"
          />
          <button type="submit" className="btn btn-info btn-sm team-v2-create-submit" disabled={creatingTeam}>
            {creatingTeam ? '생성 중' : '생성'}
          </button>
        </form>
      )}
    </section>
  );
}

export default TeamCreatePanel;
