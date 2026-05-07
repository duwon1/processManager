export const NODE_STATUS_META = Object.freeze({
  Y: {
    label: '온라인',
    dotClass: 'bg-success',
    textClass: 'text-success',
    className: 'text-success',
    rank: 0,
  },
  D: {
    label: '삭제 대기',
    dotClass: 'bg-warning',
    textClass: 'text-warning',
    className: 'text-warning',
    rank: 1,
  },
  N: {
    label: '오프라인',
    dotClass: 'bg-danger',
    textClass: 'text-danger',
    className: 'text-danger',
    rank: 2,
  },
});

export const getNodeStatusMeta = (status) => NODE_STATUS_META[status] ?? NODE_STATUS_META.N;
