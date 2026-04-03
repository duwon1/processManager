import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * 인증이 필요한 API 요청을 보내는 커스텀 훅입니다.
 * - Authorization 헤더에 JWT 토큰을 자동으로 첨부합니다.
 * - 401 응답 시 Refresh Token으로 자동 재발급(silent refresh)을 시도합니다.
 * - 재발급도 실패하면 로그아웃 후 로그인 페이지로 이동합니다.
 * - 동시에 여러 요청이 401을 받아도 refresh는 1번만 실행됩니다.
 */
export function useAuthFetch() {
    const navigate      = useNavigate();
    const { logout }    = useAuth();
    // refresh 진행 중 여부를 ref로 관리해 중복 호출을 방지합니다.
    const isRefreshing  = useRef(false);
    const pendingQueue  = useRef([]);

    // refresh 완료 후 대기 중인 요청들을 일괄 처리합니다.
    const flushQueue = useCallback((newToken) => {
        pendingQueue.current.forEach(({ resolve, reject, url, options }) => {
            if (newToken) {
                resolve(fetchWithToken(url, options, newToken));
            } else {
                reject(new Error('인증 실패'));
            }
        });
        pendingQueue.current = [];
    }, []);

    const fetchWithToken = (url, options, token) =>
        fetch(url, {
            ...options,
            headers: { 'Authorization': `Bearer ${token}`, ...options.headers },
        });

    const authFetch = useCallback(async (url, options = {}) => {
        const token = localStorage.getItem('accessToken');
        const res   = await fetchWithToken(url, options, token);

        if (res.status !== 401) return res;

        // 401: silent refresh 시도
        if (isRefreshing.current) {
            // 이미 refresh 중이면 완료될 때까지 대기
            return new Promise((resolve, reject) => {
                pendingQueue.current.push({ resolve, reject, url, options });
            });
        }

        isRefreshing.current = true;

        try {
            const refreshRes = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include', // HttpOnly 쿠키 자동 포함
            });

            if (!refreshRes.ok) throw new Error('Refresh 실패');

            const { accessToken: newToken } = await refreshRes.json();
            localStorage.setItem('accessToken', newToken);

            // 대기 중인 요청들 재시도
            flushQueue(newToken);

            // 원래 요청 재시도
            return fetchWithToken(url, options, newToken);

        } catch {
            // refresh 실패: 전체 로그아웃
            flushQueue(null);
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            logout();
            navigate('/login');
            return null;
        } finally {
            isRefreshing.current = false;
        }
    }, [logout, navigate, flushQueue]);

    return authFetch;
}
