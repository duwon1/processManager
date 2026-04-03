import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import OAuth2RedirectHandler from './pages/OAuth2RedirectHandler';
import Login from "./pages/Login";
import Main from "./pages/Main";
import DashBoard from "./pages/DashBoard";

// 루트 경로('/') 접속 시 토큰 여부에 따라 분기합니다.
// - 인증 확인 중: 아무것도 렌더링하지 않음 (깜빡임 방지)
// - 토큰 있음: /main 으로 이동
// - 토큰 없음: /login 으로 이동 (토스트 없이)
function RootRedirect() {
    const { isAuthenticated, isAuthChecking } = useAuth();
    if (isAuthChecking) return null;
    return <Navigate to={isAuthenticated ? '/main' : '/login'} replace />;
}

function App() {
    return (
        <AuthProvider> {/* 모든 컴포넌트가 인증 정보를 공유할 수 있게 감싸줍니다 */}
            <BrowserRouter>
                <Routes>
                    {/* 루트 경로: 토큰 여부에 따라 자동 분기 */}
                    <Route path="/" element={<RootRedirect />} />

                    <Route path="/login" element={<Login />} />
                    <Route path="/oauth2/redirect" element={<OAuth2RedirectHandler />} />

                    {/* ProtectedRoute가 프롭스 없이 스스로 판단합니다 */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/main" element={<Main />} />
                        <Route path="/dashboard/:nodeId" element={<DashBoard />} /> {/* 노드별 대시보드 */}
                    </Route>

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;
