function TeamInvitations({ invitations, onInvitation }) {
  if (invitations.length === 0) return null;

  return (
    <section className="team-v2-invitations">
      <div className="team-v2-invite-heading">
        <span className="team-v2-invite-icon">
          <i className="bi bi-envelope-paper"></i>
        </span>
        <div className="min-w-0">
          <div className="team-v2-section-title">받은 팀 초대</div>
          <div className="team-v2-section-subtitle">초대는 30분 동안 유효하며, 수락하면 공유 노드가 표시됩니다.</div>
        </div>
        <span className="team-v2-count-badge team-v2-count-badge-warning">{invitations.length}</span>
      </div>

      <div className="team-v2-invite-list">
        {invitations.map(invitation => (
          <article key={invitation.id} className="team-v2-invite-item">
            <div className="team-v2-invite-avatar" aria-hidden="true">
              {(invitation.teamName || 'T')[0].toUpperCase()}
            </div>
            <div className="team-v2-invite-copy">
              <div className="team-v2-invite-name">{invitation.teamName}</div>
              <div className="team-v2-invite-meta">초대한 사람: {invitation.invitedByEmail || '-'}</div>
            </div>
            <div className="team-v2-invite-actions">
              <button type="button" className="btn btn-info btn-sm" onClick={() => onInvitation(invitation, 'accept')}>
                <i className="bi bi-check-lg me-1"></i>수락
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onInvitation(invitation, 'reject')}>
                거절
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default TeamInvitations;
