/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react';

// 1. 인증 정보를 담을 컨텍스트 생성 (기본값 null)
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // [상태 1] 메모리에 저장되는 액세스 토큰 (XSS 방어를 위해 localStorage 미사용)
    const [accessToken, setAccessToken] = useState(null);

    // [상태 2] 현재 사용자가 로그인된 상태인지 확인
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // [상태 3] 앱이 처음 켜질 때 토큰을 확인 중인지 나타내는 플래그
    const [isAuthChecking, setIsAuthChecking] = useState(true);

    // [함수] 로그인 성공 시 호출: 토큰을 메모리(state)에 저장
    const login = (token) => {
        setAccessToken(token);
        setIsAuthenticated(true);
    };

    // [함수] 로그아웃 시 호출: 백엔드 Refresh Token 폐기 후 메모리 초기화
    const logout = () => {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
        setAccessToken(null);
        setIsAuthenticated(false);
    };

    // [이펙트] 앱 마운트 시 최초 1회 실행: Refresh Token으로 액세스 토큰 재발급 시도
    useEffect(() => {
        // OAuth 리다이렉트 중이면 처리하지 않음 (OAuth2RedirectHandler가 처리)
        if (window.location.search.includes('accessToken')) return;

        const checkAuth = async () => {
            // 기존 방식(localStorage)으로 저장된 토큰 잔여분 제거
            localStorage.removeItem('accessToken');

            try {
                // HttpOnly 쿠키의 Refresh Token으로 새 액세스 토큰 발급 시도
                const res = await fetch('/api/auth/refresh', {
                    method: 'POST',
                    credentials: 'include',
                });
                if (res.ok) {
                    const { accessToken: newToken } = await res.json();
                    setAccessToken(newToken);
                    setIsAuthenticated(true);
                }
            } catch {
                // 리프레시 실패 시 비로그인 상태 유지
            } finally {
                setIsAuthChecking(false);
            }
        };

        checkAuth();
    }, []);

    return (
        /* 컨텍스트를 통해 하위 컴포넌트들에게 인증 상태와 제어 함수들을 전달 */
        <AuthContext.Provider value={{ accessToken, isAuthenticated, isAuthChecking, setIsAuthChecking, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// 하위 컴포넌트에서 편리하게 인증 정보를 가져다 쓸 수 있게 만든 커스텀 훅
export const useAuth = () => useContext(AuthContext);
