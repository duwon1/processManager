import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import Monitoring from "../components/Monitoring.jsx";
import MonitoringChart from "../components/MonitoringChart.jsx";
import ProcessTable from "../components/ProcessTable.jsx";

// 대시보드 탭 목록
const TABS = ['모니터링', '프로세스', '작업관리자', '서비스', '터미널'];

function DashBoard() {
    // URL 파라미터에서 노드 ID를 가져옵니다. (예: /dashboard/3 → nodeId: "3")
    const { nodeId } = useParams();
    const [metrics, setMetrics] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [history, setHistory] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [processes, setProcesses] = useState([]);
    const [processNodeName, setProcessNodeName] = useState('');
    const [processLastUpdated, setProcessLastUpdated] = useState(null);
    const [killResult, setKillResult] = useState(null);
    const stompClientRef = useRef(null);

    // 현재 활성 탭을 URL 쿼리 파라미터(?tab=...)로 관리합니다. 기본값은 모니터링입니다.
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : '모니터링';
    const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

    const parseNum = (arr, id) => {
        const val = arr.find(d => d.id === id)?.value ?? '0';
        const n = parseFloat(val);
        return isNaN(n) ? 0 : n;
    };

    const parseNetwork = (arr, id) => {
        const val = arr.find(d => d.id === id)?.value ?? '0';
        const n = parseFloat(val);
        if (isNaN(n)) return 0;
        const lower = val.toLowerCase();
        if (lower.includes('mb')) return n * 1024;
        return n; // kB
    };

    useEffect(() => {
        let mounted = true;
        const reconnectTimer = { current: null };

        const connect = () => {
            const socket = new SockJS("/ws");
            const stompClient = Stomp.over(socket);
            stompClient.debug = null;
            stompClientRef.current = stompClient;

            // JWT를 STOMP CONNECT 헤더에 포함해 백엔드가 브라우저 세션을 인증할 수 있게 합니다.
            stompClient.connect({ jwt: localStorage.getItem('accessToken') }, () => {
                if (!mounted) return;
                console.log("✅ 대시보드가 서버와 연결되었습니다!");
                setIsConnected(true);

                stompClient.subscribe('/topic/monitoring', (frame) => {
                    if (!mounted) return;
                    try {
                        const realTimeData = JSON.parse(frame.body);
                        setMetrics(realTimeData);

                        const timeStr = new Date().toLocaleTimeString('ko-KR');
                        setLastUpdated(timeStr);
                        setHistory(prev => {
                            const avg = (key, raw) => {
                                const last = prev.slice(-2).map(p => p[key]);
                                return (last.reduce((a, b) => a + b, 0) + raw) / (last.length + 1);
                            };
                            const netSent = parseNetwork(realTimeData, 5);
                            const netRecv = parseNetwork(realTimeData, 6);
                            return [...prev.slice(-29), {
                                time: timeStr,
                                cpu: parseNum(realTimeData, 1),
                                gpu: parseNum(realTimeData, 2),
                                memory: parseNum(realTimeData, 3),
                                disk: parseNum(realTimeData, 4),
                                netSent: parseFloat(avg('netSent', netSent).toFixed(2)),
                                netRecv: parseFloat(avg('netRecv', netRecv).toFixed(2)),
                            }];
                        });
                    } catch (error) {
                        console.error("데이터 파싱 오류:", error);
                    }
                });

                // 선택한 노드의 프로세스 목록만 받아서 작업관리자형 화면에 표시합니다.
                stompClient.subscribe('/topic/process', (frame) => {
                    if (!mounted) return;
                    try {
                        const payload = JSON.parse(frame.body);
                        // 백엔드가 아직 구형 형식(배열) 또는 신형 형식(객체) 중 어느 쪽을 보내더라도 화면에서 처리합니다.
                        if (Array.isArray(payload)) {
                            setProcesses(payload);
                            setProcessNodeName('');
                            setProcessLastUpdated(new Date().toISOString());
                            return;
                        }

                        const incomingNodeId = payload?.nodeId != null ? String(payload.nodeId) : null;
                        const nextProcesses = Array.isArray(payload?.processes) ? payload.processes : [];

                        // nodeId가 없는 구버전 백엔드 응답은 현재 대시보드에 그대로 표시합니다.
                        if (incomingNodeId && incomingNodeId !== String(nodeId)) {
                            return;
                        }

                        setProcesses(nextProcesses);
                        setProcessNodeName(payload?.nodeName ?? '');
                        setProcessLastUpdated(payload?.updatedAt ?? new Date().toISOString());
                    } catch (error) {
                        console.error("프로세스 데이터 파싱 오류:", error);
                    }
                });
                // 에이전트 kill 결과를 수신해 ProcessTable에 전달합니다.
                stompClient.subscribe('/topic/process-kill-result', (frame) => {
                    if (!mounted) return;
                    try {
                        const result = JSON.parse(frame.body);
                        // 현재 대시보드의 노드 결과만 처리합니다.
                        if (result.nodeId == null || String(result.nodeId) === String(nodeId)) {
                            setKillResult({ ...result, _ts: Date.now() });
                        }
                    } catch (error) {
                        console.error("kill 결과 파싱 오류:", error);
                    }
                });
            }, (error) => {
                if (!mounted) return;
                console.error("❌ 연결 에러, 3초 후 재시도...", error);
                setIsConnected(false);
                reconnectTimer.current = setTimeout(() => {
                    if (mounted) connect();
                }, 3000);
            });
        };

        connect();

        return () => {
            mounted = false;
            clearTimeout(reconnectTimer.current);
            if (stompClientRef.current?.connected) {
                stompClientRef.current.disconnect();
            }
        };
    }, [nodeId]);

    // 브라우저 WebSocket(STOMP)으로 에이전트에 kill 명령을 전송합니다.
    const handleKill = useCallback((pid) => {
        if (!stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/node.kill',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId), pid })
        );
    }, [nodeId]);

    return (
        <div className="d-flex vh-100 overflow-hidden"> {/* 배경색 통일 */}
            <SideBar />

            <div className="d-flex flex-column flex-grow-1">
                {/* 헤더에 탭 목록과 현재 활성 탭을 전달합니다. */}
                <Header tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

                {/* 탭별 콘텐츠 — 프로세스 탭은 내부에서 스크롤을 처리하므로 overflow-hidden으로 고정합니다. */}
                <main className={`container p-2 flex-grow-1 overflow-x-hidden d-flex flex-column ${activeTab === '프로세스' ? 'overflow-hidden mt-3' : 'overflow-y-auto mt-5'}`}>
                    {activeTab === '모니터링' && (
                        metrics.length === 0 ? (
                            <div className="text-center mt-5 text-secondary">
                                <div className="spinner-border mb-3 text-info" role="status"></div>
                                <h5>{isConnected ? "데이터 수신 대기 중..." : "서버 연결 시도 중..."}</h5>
                            </div>
                        ) : (
                            <>
                                <div className="d-flex justify-content-end mb-2">
                                    {lastUpdated && (
                                        <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                                            마지막 업데이트: {lastUpdated}
                                        </span>
                                    )}
                                </div>
                                <Monitoring metrics={metrics} />
                                <hr className="border-secondary mt-4 mb-0" />
                                <MonitoringChart history={history} />
                            </>
                        )
                    )}

                    {activeTab === '프로세스' && (
                        <ProcessTable
                            processes={processes}
                            isConnected={isConnected}
                            lastUpdated={processLastUpdated}
                            nodeName={processNodeName}
                            onKill={handleKill}
                            killResult={killResult}
                        />
                    )}

                    {/* 미구현 탭 */}
                    {!['모니터링', '프로세스'].includes(activeTab) && (
                        <div className="text-center mt-5 text-secondary">
                            <h5>{activeTab}</h5>
                            <p className="small fst-italic">준비 중입니다.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

export default DashBoard;
