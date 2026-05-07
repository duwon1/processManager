function TeamCreatePanel({ teamName, creatingTeam, onTeamNameChange, onCreateTeam }) {
  return (
    <section id="team-create-section" className="team-surface p-3">
      <details className="team-create-details">
        <summary>
          <span>
            <span className="text-light fw-semibold d-block">새 팀 만들기</span>
            <span className="text-secondary small team-mobile-muted">내 노드를 공유할 팀을 만듭니다.</span>
          </span>
          <i className="bi bi-plus-square text-info fs-5"></i>
        </summary>

        <form className="d-flex flex-column gap-2 mt-3" onSubmit={onCreateTeam}>
          <input
            className="form-control form-control-sm"
            value={teamName}
            onChange={(e) => onTeamNameChange(e.target.value)}
            maxLength={100}
            placeholder="팀 이름"
          />
          <button type="submit" className="btn btn-info btn-sm align-self-end team-create-submit" disabled={creatingTeam}>
            <i className="bi bi-plus-lg me-1"></i>{creatingTeam ? '생성 중...' : '팀 만들기'}
          </button>
        </form>
      </details>
    </section>
  );
}

export default TeamCreatePanel;
