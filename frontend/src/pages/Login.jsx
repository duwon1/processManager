import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GoogleLoginButton from '../components/GoogleLoginButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function Login() {
    const location = useLocation(); // 주소창의 보따리(state)를 가져옵니다.
    const navigate = useNavigate();
    const { isAuthenticated, isAuthChecking } = useAuth();
    const { showToast } = useToast();

    // 이미 로그인된 상태면 메인으로 리다이렉트합니다.
    useEffect(() => {
        if (!isAuthChecking && isAuthenticated) {
            navigate('/main', { replace: true });
        }
    }, [isAuthenticated, isAuthChecking, navigate]);
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



    return (
        <div className="container-lg py-4" style={{maxWidth:'600px'}}>
            <header className="text-center">
                <h2 className="text-info-emphasis fw-bold p-4">Process Manager</h2>
            </header>

            <main className="row mb-4 g-3">
                <div className="col-12 col-sm-6">
                    <div className="card card-body border-primary">
                        <h5 className="card-title">실시간 모니터링</h5>
                        <p className="card-text text-light">내 PC의 상태를 실시간으로 확인하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body border-primary">
                        <h5 className="card-title">통합관리 시스템</h5>
                        <p className="card-text text-light">여러 PC를 하나의 웹서비스로 통합하여 관리하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body border-primary">
                        <h5 className="card-title">프로세스 관리</h5>
                        <p className="card-text text-light">PC에서 실행중인 프로세스들을 한눈에 확인하고 관리하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body border-primary h-100">
                        <h5 className="card-title">서비스 제어</h5>
                        <p className="card-text text-light">시스템 서비스를 관리하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body border-primary">
                        <h5 className="card-title">원격 터미널(SSH)</h5>
                        <p className="card-text text-light">웹서비스에서 원격으로 터미널에 접근하세요.</p>
                    </div>
                </div>
            </main>

            <footer className="text-center">
                {/* 소셜로그인 버튼 */}
                <GoogleLoginButton />
            </footer>
        </div>
    );
}

export default Login;
