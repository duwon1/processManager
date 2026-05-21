export const ROLE_META = Object.freeze({
  OWNER: { label: '소유자', className: 'text-bg-primary' },
  ADMIN: { label: '관리자', className: 'text-bg-info' },
  MEMBER: { label: '일반 사용자', className: 'text-bg-secondary' },
});

export const MEMBER_STATUS_META = Object.freeze({
  ACTIVE: { label: '활성', className: 'text-bg-success' },
  INVITED: { label: '초대 대기', className: 'text-bg-warning' },
  REJECTED: { label: '거절', className: 'text-bg-secondary' },
  CANCELLED: { label: '취소', className: 'text-bg-secondary' },
  REMOVED: { label: '제거됨', className: 'text-bg-secondary' },
});

export const getRoleMeta = (role) => ROLE_META[role] ?? { label: role ?? '-', className: 'text-bg-secondary' };

export const getMemberStatusMeta = (status) =>
  MEMBER_STATUS_META[status] ?? { label: status ?? '-', className: 'text-bg-secondary' };
