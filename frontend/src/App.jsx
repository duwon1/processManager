import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DialogProvider } from './context/DialogContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';

// 라우트 화면을 필요한 시점에만 내려받아 초기 번들 크기 경고를 줄입니다.
const OAuth2RedirectHandler = lazy(() => import('./pages/OAuth2RedirectHandler'));
const Login = lazy(() => import("./pages/Login"));
const Main = lazy(() => import("./pages/Main"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamInvite = lazy(() => import("./pages/TeamInvite"));
const DashBoard = lazy(() => import("./pages/DashBoard"));

// 루트 경로('/') 접속 시 토큰 여부에 따라 분기합니다.
// - 인증 확인 중: 아무것도 렌더링하지 않음 (깜빡임 방지)
// - 토큰 있음: /main 으로 이동
// - 토큰 없음: /login 으로 이동 (토스트 없이)
function RootRedirect() {
    const { isAuthenticated, isAuthChecking } = useAuth();
    if (isAuthChecking) return null;
    return <Navigate to={isAuthenticated ? '/main' : '/login'} replace />;
}

function DashBoardRoute() {
    const { nodeId } = useParams();
    return <DashBoard key={nodeId ?? 'dashboard'} />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider> {/* 모든 컴포넌트가 인증 정보를 공유할 수 있게 감싸줍니다 */}
                <ToastProvider>
                    <DialogProvider>
                        <NotificationProvider>
                        {/* lazy route가 로드되는 짧은 순간에는 기존 인증 분기 화면처럼 빈 화면을 유지합니다. */}
                        <Suspense fallback={null}>
                            <Routes>
                                {/* 루트 경로: 토큰 여부에 따라 자동 분기 */}
                                <Route path="/" element={<RootRedirect />} />

                                <Route path="/login" element={<Login />} />
                                <Route path="/oauth2/redirect" element={<OAuth2RedirectHandler />} />

                                {/* ProtectedRoute가 프롭스 없이 스스로 판단합니다 */}
                                <Route element={<ProtectedRoute />}>
                                    <Route path="/main" element={<Main />} />
                                    <Route path="/teams" element={<Teams />} />
                                    <Route path="/invite/:inviteToken" element={<TeamInvite />} />
                                    <Route path="/dashboard/:nodeId" element={<DashBoardRoute />} /> {/* 노드별 대시보드 */}
                                </Route>

                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                        </NotificationProvider>
                    </DialogProvider>
                </ToastProvider>
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
