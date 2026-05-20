import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const QUIET_LOGOUT_REASONS = new Set(['manual', 'accountDeleted']);

const ProtectedRoute = () => {
    const { isAuthenticated, isAuthChecking, logoutReason } = useAuth();
    const location = useLocation();

    if (isAuthChecking) return null;

    if (!isAuthenticated) {
        const reason = logoutReason ?? location.state?.logoutReason ?? null;
        const showToast = !QUIET_LOGOUT_REASONS.has(reason);
        const message = reason === 'expired'
            ? '세션이 만료되었습니다. 다시 로그인해주세요.'
            : '로그인이 필요한 서비스입니다.';

        return (
            <Navigate
                to="/login"
                replace
                state={{
                    showToast,
                    message,
                    logoutReason: reason,
                    from: location.pathname,
                }}
            />
        );
    }

    return <Outlet />;
};

export default ProtectedRoute;
