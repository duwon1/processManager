import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { consumePostLoginRedirect } from '../utils/postLoginRedirect';

const OAuth2RedirectHandler = () => {
    const { login, setIsAuthChecking } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const token = hashParams.get('accessToken');

        if (token) {
            login(token);
            setIsAuthChecking(false);
            navigate(consumePostLoginRedirect('/main'), { replace: true });
        } else {
            setIsAuthChecking(false);
            navigate('/login', { replace: true });
        }
    }, [login, navigate, setIsAuthChecking]);

    return (
        <div className="vh-100 d-flex justify-content-center align-items-center bg-dark text-white">
            <div className="text-center">
                <div className="spinner-border text-info mb-3" role="status"></div>
                <h3>로그인 처리 중입니다...</h3>
                <p className="text-muted small">잠시만 기다려 주세요.</p>
            </div>
        </div>
    );
};

export default OAuth2RedirectHandler;
