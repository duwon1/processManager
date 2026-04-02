import React, { useState, useEffect, useRef } from 'react';
import SockJS from 'sockjs-client';
import Stomp from 'stompjs';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import Monitoring from "../components/Monitoring.jsx";
import MonitoringChart from "../components/MonitoringChart.jsx";

function DashBoard() {
    const [metrics, setMetrics] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [history, setHistory] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const stompClientRef = useRef(null);

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

            stompClient.connect({}, () => {
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
    }, []);

    return (
        <div className="d-flex vh-100 overflow-hidden"> {/* 배경색 통일 */}
            <SideBar />

            <div className="d-flex flex-column flex-grow-1">
                <Header />

                <main className="container mt-5 p-2 flex-grow-1 overflow-y-auto overflow-x-hidden">
                    {metrics.length === 0 ? (
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
                    )}
                </main>
            </div>
        </div>
    );
}

export default DashBoard;