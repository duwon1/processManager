import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import SideBar from "../components/SideBar";
import Header from "../components/Header";
import Monitoring from "../components/Monitoring.jsx";
import MonitoringChart from "../components/MonitoringChart.jsx";
import ProcessTable from "../components/ProcessTable.jsx";
import TerminalComponent from "../components/Terminal.jsx";
import TaskManager from "../components/TaskManager.jsx";
import Service from "../components/Service.jsx";
import { useAuth } from '../context/AuthContext';

// 대시보드 탭 목록 — key: URL 파라미터 값, label: 화면 표시 텍스트
const TABS = [
    { key: 'monitoring',    label: '모니터링' },
    { key: 'process',       label: '프로세스' },
    { key: 'task-manager',  label: '작업관리자' },
    { key: 'services',      label: '서비스' },
    { key: 'terminal',      label: '터미널' },
];

const findMetric = (arr, id) => Array.isArray(arr) ? arr.find(d => d.id === id) : null;

const parseNum = (arr, id) => {
    const metric = findMetric(arr, id);
    if (typeof metric?.rawValue === 'number') {
        return metric.rawValue;
    }
    const val = metric?.value ?? '0';
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

const parseNetwork = (arr, id) => {
    const metric = findMetric(arr, id);
    // 에이전트가 bytes/sec 표준 숫자를 보내면 차트의 기존 KB/s 축에 맞춰 변환합니다.
    if (typeof metric?.rawValue === 'number' && metric?.unit === 'bytesPerSecond') {
        return metric.rawValue / 1024;
    }
    const val = metric?.value ?? '0';
    const n = parseFloat(val);
    if (isNaN(n)) return 0;
    const lower = val.toLowerCase();
    if (lower.includes('mb')) return n * 1024;
    return n; // kB
};

function DashBoard() {
    // URL 파라미터에서 노드 ID를 가져옵니다. (예: /dashboard/3 → nodeId: "3")
    const { nodeId } = useParams();
    const { accessToken } = useAuth();
    // 토큰 갱신 시 WebSocket 재연결 없이 항상 최신 토큰을 참조하기 위해 ref 사용
    const accessTokenRef = useRef(accessToken);
    useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

    const [metrics, setMetrics] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [history, setHistory] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [processes, setProcesses] = useState([]);
    const [processNodeName, setProcessNodeName] = useState('');
    const [processLastUpdated, setProcessLastUpdated] = useState(null);
    const [killResult, setKillResult] = useState(null);
    const [systemInfo, setSystemInfo] = useState(null);   // 작업관리자 하드웨어 정보
    const [services, setServices] = useState([]);
    const [serviceNodeName, setServiceNodeName] = useState('');
    const [serviceControlResult, setServiceControlResult] = useState(null);
    const [stompClient, setStompClient] = useState(null);
    const stompClientRef = useRef(null);

    // 현재 활성 탭을 URL 쿼리 파라미터(?tab=...)로 관리합니다. 기본값은 monitoring입니다.
    const [searchParams, setSearchParams] = useSearchParams();
    const TAB_KEYS = TABS.map(t => t.key);
    const activeTab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'monitoring';
    const setActiveTab = (key) => setSearchParams({ tab: key }, { replace: true });

    useEffect(() => {
        let mounted = true;
        let reconnectTimerId = null;

        const connect = () => {
            const stompClient = new Client({
                // 브라우저/SockJS 전용 WebSocket 팩토리로 Node용 net 모듈 번들 경고를 피합니다.
                webSocketFactory: () => new SockJS("/ws"),
                connectHeaders: { jwt: accessTokenRef.current ?? '' },
                debug: () => {},
                reconnectDelay: 0,
            });
            // 기존 컴포넌트들이 쓰는 send(destination, headers, body) 호출 형태를 유지합니다.
            stompClient.send = (destination, headers = {}, body = '') => {
                stompClient.publish({ destination, headers, body });
            };
            stompClientRef.current = stompClient;
            setStompClient(stompClient);

            // JWT를 STOMP CONNECT 헤더에 포함해 백엔드가 브라우저 세션을 인증할 수 있게 합니다.
            stompClient.onConnect = () => {
                if (!mounted) return;
                console.log("✅ 대시보드가 서버와 연결되었습니다!");
                setIsConnected(true);

                stompClient.subscribe('/topic/monitoring', (frame) => {
                    if (!mounted) return;
                    try {
                        const payload = JSON.parse(frame.body);
                        const realTimeData = Array.isArray(payload) ? payload : (payload?.metrics ?? []);
                        setMetrics(realTimeData);

                        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
                        setHistory(prev => {
                            const avg = (key, raw) => {
                                const last = prev.slice(-2).map(p => p[key]);
                                return (last.reduce((a, b) => a + b, 0) + raw) / (last.length + 1);
                            };
                            const netSent = parseNetwork(realTimeData, 5);
                            const netRecv = parseNetwork(realTimeData, 6);
                            const next = [...prev.slice(-29), {
                                cpu: parseNum(realTimeData, 1),
                                gpu: parseNum(realTimeData, 2),
                                memory: parseNum(realTimeData, 3),
                                disk: parseNum(realTimeData, 4),
                                netSent: parseFloat(avg('netSent', netSent).toFixed(2)),
                                netRecv: parseFloat(avg('netRecv', netRecv).toFixed(2)),
                            }];
                            // X축 레이블을 항상 0s~(n-1)*2s 상대 시간으로 유지합니다.
                            return next.map((entry, i) => ({ ...entry, time: `${i * 2}s` }));
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
                // 에이전트가 수집한 시스템 정보를 수신해 TaskManager에 전달합니다.
                stompClient.subscribe('/topic/system-info', (frame) => {
                    if (!mounted) return;
                    try {
                        const data = JSON.parse(frame.body);
                        if (data?.nodeId == null || String(data.nodeId) === String(nodeId)) {
                            setSystemInfo(data);
                        }
                    } catch (e) {
                        console.error("시스템 정보 파싱 오류:", e);
                    }
                });

                // 에이전트가 보낸 서비스 목록을 수신합니다.
                stompClient.subscribe('/topic/service', (frame) => {
                    if (!mounted) return;
                    try {
                        const payload = JSON.parse(frame.body);
                        const incomingNodeId = payload?.nodeId != null ? String(payload.nodeId) : null;
                        if (incomingNodeId && incomingNodeId !== String(nodeId)) return;
                        setServices(Array.isArray(payload?.services) ? payload.services : []);
                        setServiceNodeName(payload?.nodeName ?? '');
                    } catch (e) {
                        console.error("서비스 데이터 파싱 오류:", e);
                    }
                });

                // 서비스 제어 결과를 수신합니다.
                stompClient.subscribe('/topic/service-control-result', (frame) => {
                    if (!mounted) return;
                    try {
                        const result = JSON.parse(frame.body);
                        setServiceControlResult({ ...result, _ts: Date.now() });
                        // 3초 후 결과 메시지 자동 제거
                        setTimeout(() => setServiceControlResult(null), 3000);
                    } catch (e) {
                        console.error("서비스 제어 결과 파싱 오류:", e);
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

            };

            const scheduleReconnect = (error) => {
                if (!mounted) return;
                console.error("❌ 연결 에러, 3초 후 재시도...", error);
                setIsConnected(false);
                reconnectTimerId = setTimeout(() => {
                    if (mounted) connect();
                }, 3000);
            };

            stompClient.onStompError = scheduleReconnect;
            stompClient.onWebSocketError = scheduleReconnect;
            stompClient.onWebSocketClose = () => {
                if (mounted && stompClientRef.current === stompClient) {
                    scheduleReconnect('WebSocket closed');
                }
            };

            stompClient.activate();
        };

        connect();

        return () => {
            mounted = false;
            clearTimeout(reconnectTimerId);
            if (stompClientRef.current) {
                stompClientRef.current.deactivate();
            }
            setStompClient(null);
        };
    }, [nodeId]);

    // 작업관리자 탭이 활성화될 때 시스템 정보를 요청합니다. (탭 전환 또는 수동 새로 고침 시)
    const handleRequestSystemInfo = useCallback(() => {
        if (!stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/system-info.request',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId) })
        );
    }, [nodeId]);

    // task-manager 탭이 열리거나 연결이 완료됐을 때 systemInfo가 없으면 자동 요청합니다.
    useEffect(() => {
        if (activeTab === 'task-manager' && !systemInfo && stompClientRef.current?.connected) {
            handleRequestSystemInfo();
        }
    }, [activeTab, systemInfo, handleRequestSystemInfo, isConnected]);

    // task-manager 탭 활성 중 30초마다 systemInfo(디스크 속도 등 스냅샷 필드)를 자동 갱신합니다.
    useEffect(() => {
        if (activeTab !== 'task-manager') return;
        const timer = setInterval(() => {
            if (stompClientRef.current?.connected) handleRequestSystemInfo();
        }, 30000);
        return () => clearInterval(timer);
    }, [activeTab, handleRequestSystemInfo]);

    // 브라우저 WebSocket(STOMP)으로 에이전트에 서비스 제어 명령을 전송합니다.
    const handleServiceControl = useCallback((name, action) => {
        if (!stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/node.service-control',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId), name, action })
        );
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

            {/* min-width:0 — flex item이 테이블 content 너비로 강제 확장되는 현상 방지 */}
            <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
                {/* 헤더에 탭 목록과 현재 활성 탭을 전달합니다. */}
                <Header tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} tabKey="key" tabLabel="label" />

                {/* 탭별 콘텐츠 — 프로세스/터미널 탭은 내부에서 스크롤을 처리하므로 overflow-hidden으로 고정합니다. */}
                {/* process/services 탭은 테이블 가로 스크롤을 허용하기 위해 overflow-y-hidden만 적용합니다. */}
                <main className={`${activeTab === 'task-manager' ? 'container-fluid px-2 px-sm-3 px-md-4' : 'container p-2'} flex-grow-1 d-flex flex-column ${ ['process', 'services'].includes(activeTab) ? 'overflow-y-hidden mt-2' : ['terminal', 'task-manager'].includes(activeTab) ? 'overflow-hidden mt-2' : 'overflow-y-auto mt-2'}`} style={activeTab === 'task-manager' ? { maxWidth: 1600 } : {}}>
                    {activeTab === 'monitoring' && (
                        metrics.length === 0 ? (
                            <div className="text-center mt-5 text-secondary">
                                <div className="spinner-border mb-3 text-info" role="status"></div>
                                <h5>{isConnected ? "데이터 수신 대기 중..." : "서버 연결 시도 중..."}</h5>
                            </div>
                        ) : (
                            <>
                                <div className="d-flex align-items-center justify-content-between mb-2">
                                    <span className="text-info fw-semibold" style={{ fontSize: '0.9rem' }}>시스템 사용률</span>
                                    {lastUpdated && (
                                        <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                            마지막 업데이트: {lastUpdated}
                                        </span>
                                    )}
                                </div>
                                <Monitoring metrics={metrics} />
                                <hr className="border-secondary mt-3 mb-0" />
                                <MonitoringChart history={history} />
                            </>
                        )
                    )}

                    {activeTab === 'process' && (
                        <ProcessTable
                            processes={processes}
                            isConnected={isConnected}
                            lastUpdated={processLastUpdated}
                            nodeName={processNodeName}
                            onKill={handleKill}
                            killResult={killResult}
                        />
                    )}

                    {/* 작업관리자 성능 탭 — flex-grow-1로 남은 높이를 채웁니다. */}
                    {activeTab === 'task-manager' && (
                        <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                            <TaskManager
                                metrics={metrics}
                                history={history}
                                processes={processes}
                                systemInfo={systemInfo}
                                onRefresh={handleRequestSystemInfo}
                            />
                        </div>
                    )}

                    {/* 터미널 탭 — 항상 마운트 유지, 탭 전환 시 숨기기만 해서 PTY 세션을 보존합니다. */}
                    <div className={activeTab === 'terminal' ? 'd-flex flex-column flex-grow-1 overflow-hidden' : 'd-none'}>
                        <TerminalComponent
                            stompClient={stompClient}
                            nodeId={nodeId}
                            isConnected={isConnected}
                            visible={activeTab === 'terminal'}
                        />
                    </div>

                    {activeTab === 'services' && (
                        <Service
                            services={services}
                            isConnected={isConnected}
                            nodeName={serviceNodeName}
                            onControl={handleServiceControl}
                            controlResult={serviceControlResult}
                        />
                    )}
                </main>
            </div>
        </div>
    );
}

export default DashBoard;
