import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import OAuth2RedirectHandler from './pages/OAuth2RedirectHandler';
import Login from "./pages/Login";
import Main from "./pages/Main";
import DashBoard from "./pages/DashBoard";

function App() {
    return (
        <AuthProvider> {/* 모든 컴포넌트가 인증 정보를 공유할 수 있게 감싸줍니다 */}
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/oauth2/redirect" element={<OAuth2RedirectHandler />} />
                    {/* ProtectedRoute가 프롭스 없이 스스로 판단합니다 */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/main" element={<Main />} />
                        <Route path="/dashboard/:nodeId" element={<DashBoard />} /> {/* 노드별 대시보드 */}
                        <Route path="/" element={<Navigate to="/main" replace />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/main" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;