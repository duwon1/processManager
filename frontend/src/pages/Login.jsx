import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isSafeInternalPath, savePostLoginRedirect } from '../utils/postLoginRedirect';

function Login() {
    const location = useLocation(); // 주소창의 보따리(state)를 가져옵니다.
    const navigate = useNavigate();
    const { isAuthenticated, isAuthChecking, clearLogoutReason } = useAuth();
    const { showToast } = useToast();

    // 이미 로그인된 상태면 메인으로 리다이렉트합니다.
    useEffect(() => {
        if (!isAuthChecking && isAuthenticated) {
            const from = location.state?.from;
            navigate(isSafeInternalPath(from) ? from : '/main', { replace: true });
        }
    }, [isAuthenticated, isAuthChecking, location.state, navigate]);

    useEffect(() => {
        const from = location.state?.from;
        if (isSafeInternalPath(from)) {
            savePostLoginRedirect(from);
        }
    }, [location.state]);
    useEffect(() => {
        // ProtectedRoute에서 보낸 state가 있는지 확인
        if (location.state?.showToast) {
            const timer = setTimeout(() => {
                // 라우터 state의 안내 메시지를 전역 토스트로 한 번만 표시합니다.
                showToast('warning', location.state.message);
            }, 0);

            // 중요: 새로고침 시 토스트가 또 뜨지 않게 브라우저 기록에서 state를 비워줍니다.
            window.history.replaceState({}, document.title);
            return () => clearTimeout(timer);
        }
    }, [location, showToast]);

    useEffect(() => {
        if (!location.state?.logoutReason) return;
        clearLogoutReason();
        window.history.replaceState({}, document.title);
    }, [location, clearLogoutReason]);



    return (
        <div className="login-shell">
            <main className="login-panel">
                <header className="mb-3">
                    <h1 className="login-brand">Process Manager</h1>
                    <p className="login-copy">Google 계정으로 계속합니다.</p>
                </header>
                <GoogleLoginButton />
            </main>
        </div>
    );
}

export default Login;
