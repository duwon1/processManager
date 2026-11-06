const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * STOMP 재연결 대기 시간을 지수 백오프(최대 30초) + 지터로 계산합니다.
 * 절반은 고정, 절반은 무작위로 두어 서버 재시작 직후 여러 탭이 같은 순간에 몰려 재접속하지 않게 합니다.
 */
export const getReconnectDelay = (attempt) => {
    const ceiling = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt));
    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
};
