import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

let refreshPromise = null;

const requestRefreshToken = async () => {
    if (!refreshPromise) {
        refreshPromise = fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('Refresh 실패');
                const { accessToken } = await res.json();
                return accessToken;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
};

/**
 * 인증이 필요한 API 요청을 보내는 커스텀 훅입니다.
 * - Authorization 헤더에 JWT 토큰을 자동으로 첨부합니다.
 * - 401 응답 시 Refresh Token으로 자동 재발급(silent refresh)을 시도합니다.
 * - 재발급도 실패하면 로그아웃 후 로그인 페이지로 이동합니다.
 * - 동시에 여러 요청이 401을 받아도 refresh는 1번만 실행됩니다.
 */
export function useAuthFetch() {
    const { accessToken, login, logout } = useAuth();

    const fetchWithToken = (url, options, token) =>
        fetch(url, {
            ...options,
            headers: { 'Authorization': `Bearer ${token}`, ...options.headers },
        });

    const authFetch = useCallback(async (url, options = {}) => {
        let token = accessToken;

        if (!token) {
            try {
                token = await requestRefreshToken();
                login(token);
            } catch {
                return null;
            }
        }

        // localStorage 대신 메모리(context)에서 액세스 토큰을 가져옵니다.
        const res = await fetchWithToken(url, options, token);

        if (res.status !== 401) return res;

        try {
            // Refresh Token은 rotation 방식이라 앱 전체에서 동시에 1번만 갱신해야 합니다.
            const newToken = await requestRefreshToken();
            // 새 토큰을 메모리(context)에 저장합니다.
            login(newToken);

            // 원래 요청 재시도
            return fetchWithToken(url, options, newToken);

        } catch {
            // refresh 실패: 전체 로그아웃
            logout({ reason: 'expired' });
            return null;
        }
    }, [accessToken, login, logout]);

    return authFetch;
}
