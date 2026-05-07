function TeamInvitations({ invitations, onInvitation }) {
  if (invitations.length === 0) return null;

  return (
    <section className="team-surface team-invitation-band mb-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <div>
          <div className="text-info fw-semibold">받은 팀 초대</div>
          <div className="text-secondary small team-mobile-muted">수락하면 공유된 노드가 사이드바와 대시보드에 표시됩니다.</div>
        </div>
        <span className="badge text-bg-info">{invitations.length}건</span>
      </div>
      <div className="team-invitation-grid">
        {invitations.map(invitation => (
          <div key={invitation.id} className="team-invitation-item">
            <div className="min-w-0">
              <div className="text-light fw-semibold text-truncate">{invitation.teamName}</div>
              <small className="text-secondary text-truncate d-block">초대한 사람: {invitation.invitedByEmail || '-'}</small>
            </div>
            <div className="d-flex gap-2 flex-shrink-0">
              <button type="button" className="btn btn-info btn-sm" onClick={() => onInvitation(invitation, 'accept')}>
                <i className="bi bi-check-lg me-1"></i>수락
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onInvitation(invitation, 'reject')}>
                거절
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TeamInvitations;
