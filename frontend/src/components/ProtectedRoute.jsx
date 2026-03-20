import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // 중앙 센터에서 정보 가져오기

const ProtectedRoute = () => {
    const { isAuthenticated, isAuthChecking } = useAuth();
    const location = useLocation();

    // 1. 아직 검사 중이라면 아무것도 보여주지 않음 (튕김 방지)
    if (isAuthChecking) return null;

    // 2. 로그인이 안 되어 있다면 로그인 페이지로 보내면서 토스트 메시지 예약
    if (!isAuthenticated) {
        return <Navigate
            to="/login"
            replace
            state={{
                showToast: true,
                message: "로그인이 필요한 서비스입니다.",
                from: location.pathname // 나중에 로그인 성공 후 돌아올 주소 기억용
            }}
        />;
    }

    // 3. 로그인이 되어 있다면 자식 컴포넌트(Main 등)를 보여줌
    return <Outlet />;
};

export default ProtectedRoute;