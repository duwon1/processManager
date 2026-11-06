// 바이트 값을 사람이 읽기 쉬운 단위(B~TB)로 변환합니다. 숫자가 아니면 null을 반환합니다.
export const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return null;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let next = Math.abs(bytes);
    let unitIndex = 0;
    while (next >= 1024 && unitIndex < units.length - 1) {
        next /= 1024;
        unitIndex += 1;
    }
    const sign = bytes < 0 ? '-' : '';
    const precision = unitIndex === 0 || next >= 100 ? 0 : 1;
    return `${sign}${next.toFixed(precision)} ${units[unitIndex]}`;
};
