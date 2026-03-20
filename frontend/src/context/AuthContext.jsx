import React, { createContext, useContext, useState, useEffect } from 'react';

// 1. 인증 정보를 담을 컨텍스트 생성 (기본값 null)
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // [상태 1] 현재 사용자가 로그인된 상태인지 확인
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // [상태 2] 앱이 처음 켜질 때 토큰을 확인 중인지 나타내는 플래그
    // (이게 true일 때 로딩 화면을 보여주면 로그인 전 깜빡임 현상을 막을 수 있습니다)
    const [isAuthChecking, setIsAuthChecking] = useState(true);

    // [함수] 로그인 성공 시 호출: 토큰을 저장하고 상태를 true로 변경
    const login = (token) => {
        localStorage.setItem('accessToken', token); // 브라우저 저장소에 토큰 보관
        setIsAuthenticated(true);
    };

    // [함수] 로그아웃 시 호출: 토큰을 삭제하고 상태를 false로 변경
    const logout = () => {
        localStorage.removeItem('accessToken'); // 저장소에서 토큰 제거
        setIsAuthenticated(false);
    };

    // [이펙트] 앱 마운트 시 최초 1회 실행: 기존 로그인 세션이 있는지 체크
    useEffect(() => {
        const token = localStorage.getItem('accessToken');

        // 로컬 저장소에 토큰이 있다면 즉시 인증 상태를 true로 설정
        if (token) {
            setIsAuthenticated(true);
        }

        // URL 쿼리 스트링에 'accessToken'이 포함되어 있지 않은 경우에만
        // 인증 확인 절차가 끝난 것으로 간주 (OAuth 등 외부 로그인 리다이렉트 대응용)
        if (!window.location.search.includes('accessToken')) {
            setIsAuthChecking(false);
        }
        // 만약 URL에 토큰이 있다면, 다른 컴포넌트(예: 소셜로그인 처리기)에서
        // 처리가 완료될 때까지 체크 상태(isAuthChecking)를 유지함
    }, []);

    return (
        /* 컨텍스트를 통해 하위 컴포넌트들에게 인증 상태와 제어 함수들을 전달 */
        <AuthContext.Provider value={{ isAuthenticated, isAuthChecking, setIsAuthChecking, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// 하위 컴포넌트에서 편리하게 인증 정보를 가져다 쓸 수 있게 만든 커스텀 훅
export const useAuth = () => useContext(AuthContext);