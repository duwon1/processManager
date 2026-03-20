import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OAuth2RedirectHandler = () => {
    const [searchParams] = useSearchParams();
    const { login, setIsAuthChecking } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // 1. URL에서 ?accessToken=... 값을 뽑아냅니다.
        const token = searchParams.get('accessToken');

        if (token) {
            // 2. AuthContext에 있는 login 함수 실행 (토큰 저장 및 상태 변경)
            login(token);
            console.log("OAuth2 인증 성공! 토큰을 저장했습니다.");

            // 3. 검사가 끝났음을 알리고 메인으로 이동
            setIsAuthChecking(false);
            navigate('/main', { replace: true });
        } else {
            // 토큰이 없다면 로그인 실패 처리
            console.error("인증 토큰을 찾을 수 없습니다.");
            setIsAuthChecking(false);
            navigate('/login', { replace: true });
        }
    }, [login, navigate, searchParams, setIsAuthChecking]);

    // 찰나의 로딩 화면
    return (
        <div className="vh-100 d-flex justify-content-center align-items-center bg-dark text-white">
            <div className="text-center">
                <div className="spinner-border text-info mb-3" role="status"></div>
                <h3>로그인 처리 중입니다... 🔄</h3>
                <p className="text-muted small">잠시만 기다려 주세요.</p>
            </div>
        </div>
    );
};

export default OAuth2RedirectHandler;