import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { useAppHeader } from "../hooks/useAppHeader";
import Monitoring from "../components/Monitoring.jsx";
import MonitoringChart from "../components/MonitoringChart.jsx";
import ProcessTable from "../components/ProcessTable.jsx";
import TerminalComponent from "../components/Terminal.jsx";
import TaskManager from "../components/TaskManager.jsx";
import Service from "../components/Service.jsx";
import { useAuth } from '../context/AuthContext';
import { useAuthFetch } from '../hooks/useAuthFetch';

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

const parseDiskDevices = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 15 || d?.key === 'disk.devices')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value) ? value : [];
};

const parseNetworkInterfaces = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 16 || d?.key === 'network.interfaces')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value) ? value : [];
};

const parseCpuLogicalProcessors = (arr) => {
    const metric = Array.isArray(arr)
        ? arr.find(d => d?.id === 17 || d?.key === 'cpu.logicalProcessors')
        : null;
    const value = metric?.rawValue ?? metric?.value;
    return Array.isArray(value)
        ? value.map(item => Number(item)).map(item => Number.isFinite(item) ? item : 0)
        : [];
};

const hasNodeAccess = (nodeAccess, key) => Boolean(nodeAccess?.owner || nodeAccess?.[key]);
const DEFAULT_NODE_ACCESS = Object.freeze({ owner: true });
const HISTORY_WINDOW_SECONDS = 60;
const HISTORY_INTERVAL_SECONDS = 1;
const HISTORY_POINT_LIMIT = Math.floor(HISTORY_WINDOW_SECONDS / HISTORY_INTERVAL_SECONDS) + 1;

const sameDisk = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        (left.device && right.device && left.device === right.device) ||
        (left.partitions && right.partitions && left.partitions === right.partitions) ||
        (left.mountpoint && right.mountpoint && left.mountpoint === right.mountpoint)
    );
};

const buildDiskHistoryValues = (systemInfo, previousEntry = {}, liveDisks = []) => {
    const disks = Array.isArray(systemInfo?.disks) ? systemInfo.disks : [];
    return Object.fromEntries(disks.map((disk, index) => {
        const key = `disk_${index}`;
        const liveDisk = liveDisks.find(candidate => sameDisk(candidate, disk)) ?? liveDisks[index];
        const value = Number(liveDisk?.activeTimePercent ?? liveDisk?.usagePercent ?? disk?.activeTimePercent ?? disk?.usagePercent);
        const previous = Number(previousEntry?.[key]);
        return [key, Number.isFinite(value) ? value : (Number.isFinite(previous) ? previous : null)];
    }));
};

const sameNetwork = (left, right) => {
    if (!left || !right) return false;
    return Boolean(
        left.adapterName &&
        right.adapterName &&
        String(left.adapterName).toLowerCase() === String(right.adapterName).toLowerCase()
    );
};

const buildNetworkHistoryValues = (systemInfo, previousEntry = {}, liveNetworks = []) => {
    const networks = Array.isArray(systemInfo?.networks) ? systemInfo.networks : [];
    return Object.fromEntries(networks.flatMap((network, index) => {
        const liveNetwork = liveNetworks.find(candidate => sameNetwork(candidate, network)) ?? liveNetworks[index];
        const sent = Number(liveNetwork?.sentBytesPerSecond);
        const recv = Number(liveNetwork?.receivedBytesPerSecond);
        const sentKey = `network_${index}_sent`;
        const recvKey = `network_${index}_recv`;
        const previousSent = Number(previousEntry?.[sentKey]);
        const previousRecv = Number(previousEntry?.[recvKey]);
        return [
            [sentKey, Number.isFinite(sent) ? sent / 1024 : (Number.isFinite(previousSent) ? previousSent : null)],
            [recvKey, Number.isFinite(recv) ? recv / 1024 : (Number.isFinite(previousRecv) ? previousRecv : null)],
        ];
    }));
};

const fillMissingHistoryResourceValues = (history, systemInfo) => {
    if (!systemInfo || history.length === 0) return history;
    return history.map(entry => {
        const diskValues = buildDiskHistoryValues(systemInfo, entry);
        const networkValues = buildNetworkHistoryValues(systemInfo, entry);
        const missingDiskValues = Object.fromEntries(
            Object.entries(diskValues).filter(([key]) => entry[key] === undefined || entry[key] === null)
        );
        const missingNetworkValues = Object.fromEntries(
            Object.entries(networkValues).filter(([key]) => entry[key] === undefined || entry[key] === null)
        );
        return { ...entry, ...missingDiskValues, ...missingNetworkValues };
    });
};

function DashBoard() {
    // URL 파라미터에서 노드 ID를 가져옵니다. (예: /dashboard/3 → nodeId: "3")
    const { nodeId } = useParams();
    const { accessToken } = useAuth();
    const authFetch = useAuthFetch();
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
    const systemInfoRef = useRef(null);
    const [services, setServices] = useState([]);
    const [serviceNodeName, setServiceNodeName] = useState('');
    const [serviceControlResult, setServiceControlResult] = useState(null);
    const [stompClient, setStompClient] = useState(null);
    const [nodeAccessState, setNodeAccessState] = useState({ nodeId: null, node: null, loaded: false });
    const stompClientRef = useRef(null);
    const liveDiskDevices = useMemo(() => parseDiskDevices(metrics), [metrics]);
    const liveNetworkInterfaces = useMemo(() => parseNetworkInterfaces(metrics), [metrics]);

    // 현재 활성 탭을 URL 쿼리 파라미터(?tab=...)로 관리합니다. 기본값은 monitoring입니다.
    const [searchParams, setSearchParams] = useSearchParams();
    const nodeAccessResolved = nodeAccessState.nodeId === String(nodeId) && nodeAccessState.loaded;
    const nodeAccessLoading = !nodeAccessResolved;
    const nodeAccess = nodeAccessLoading ? DEFAULT_NODE_ACCESS : nodeAccessState.node;
    const nodeAccessDenied = nodeAccessResolved && !nodeAccessState.node;
    const canViewMonitoring = hasNodeAccess(nodeAccess, 'canViewMonitoring');
    const canUseTerminal = hasNodeAccess(nodeAccess, 'canUseTerminal');
    const canControlProcesses = hasNodeAccess(nodeAccess, 'canControlProcesses');
    const canControlServices = hasNodeAccess(nodeAccess, 'canControlServices');
    const dashboardTabs = useMemo(() => {
        if (!nodeAccess) return [];
        return TABS
            .filter(tab => tab.key !== 'terminal' || canUseTerminal);
    }, [canUseTerminal, nodeAccess]);
    const availableTabKeys = dashboardTabs.map(t => t.key);
    const activeTab = availableTabKeys.includes(searchParams.get('tab')) ? searchParams.get('tab') : (availableTabKeys[0] ?? 'monitoring');
    const setActiveTab = useCallback((key) => setSearchParams({ tab: key }, { replace: true }), [setSearchParams]);
    const headerConfig = useMemo(() => ({
        title: '접근 권한 없음',
        tabs: dashboardTabs.length > 0 ? dashboardTabs : undefined,
        activeTab,
        onTabChange: setActiveTab,
        tabKey: 'key',
        tabLabel: 'label',
    }), [activeTab, dashboardTabs, setActiveTab]);

    useAppHeader(headerConfig);

    useEffect(() => {
        systemInfoRef.current = systemInfo;
    }, [systemInfo]);

    useEffect(() => {
        let cancelled = false;

        authFetch('/api/node/list')
            .then(res => res?.ok ? res.json() : [])
            .then(data => {
                if (cancelled) return;
                const nodes = Array.isArray(data) ? data : [];
                setNodeAccessState({
                    nodeId: String(nodeId),
                    node: nodes.find(node => String(node.id) === String(nodeId)) || null,
                    loaded: true,
                });
            })
            .catch(() => {
                if (!cancelled) {
                    setNodeAccessState({ nodeId: String(nodeId), node: null, loaded: true });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [authFetch, nodeId]);

    useEffect(() => {
        if (nodeAccessLoading || !nodeAccess || !canViewMonitoring) {
            stompClientRef.current = null;
            return undefined;
        }

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
                setIsConnected(true);
                const nodeTopic = `/topic/node.${nodeId}`;

                stompClient.subscribe(`${nodeTopic}.monitoring`, (frame) => {
                    if (!mounted) return;
                    try {
                        const payload = JSON.parse(frame.body);
                        const realTimeData = Array.isArray(payload) ? payload : (payload?.metrics ?? []);
                        const incomingNodeId = Array.isArray(payload)
                            ? payload.find(metric => metric?.nodeId != null)?.nodeId
                            : payload?.nodeId;
                        if (incomingNodeId != null && String(incomingNodeId) !== String(nodeId)) {
                            return;
                        }
                        setMetrics(realTimeData);

                        setLastUpdated(new Date().toLocaleTimeString('ko-KR'));
                        setHistory(prev => {
                            const avg = (key, raw) => {
                                const last = prev.slice(-2).map(p => p[key]);
                                return (last.reduce((a, b) => a + b, 0) + raw) / (last.length + 1);
                            };
                            const netSent = parseNetwork(realTimeData, 5);
                            const netRecv = parseNetwork(realTimeData, 6);
                            const disk = parseNum(realTimeData, 4);
                            const liveDisks = parseDiskDevices(realTimeData);
                            const liveNetworks = parseNetworkInterfaces(realTimeData);
                            const cpuLogicalValues = Object.fromEntries(
                                parseCpuLogicalProcessors(realTimeData)
                                    .map((value, index) => [`cpu_logical_${index}`, value])
                            );
                            const next = [...prev.slice(-(HISTORY_POINT_LIMIT - 1)), {
                                cpu: parseNum(realTimeData, 1),
                                ...cpuLogicalValues,
                                gpu: parseNum(realTimeData, 2),
                                memory: parseNum(realTimeData, 3),
                                disk,
                                ...buildDiskHistoryValues(systemInfoRef.current, prev[prev.length - 1], liveDisks),
                                ...buildNetworkHistoryValues(systemInfoRef.current, prev[prev.length - 1], liveNetworks),
                                netSent: parseFloat(avg('netSent', netSent).toFixed(2)),
                                netRecv: parseFloat(avg('netRecv', netRecv).toFixed(2)),
                            }];
                            // X축 레이블을 항상 0s~60s 상대 시간으로 유지합니다.
                            return next.map((entry, i) => ({ ...entry, time: `${i * HISTORY_INTERVAL_SECONDS}s` }));
                        });
                    } catch (error) {
                        console.error("데이터 파싱 오류:", error);
                    }
                });

                // 선택한 노드의 프로세스 목록만 받아서 작업관리자형 화면에 표시합니다.
                stompClient.subscribe(`${nodeTopic}.process`, (frame) => {
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
                stompClient.subscribe(`${nodeTopic}.system-info`, (frame) => {
                    if (!mounted) return;
                    try {
                        const data = JSON.parse(frame.body);
                        if (data?.nodeId == null || String(data.nodeId) === String(nodeId)) {
                            systemInfoRef.current = data;
                            setSystemInfo(data);
                            setHistory(prev => fillMissingHistoryResourceValues(prev, data));
                        }
                    } catch (e) {
                        console.error("시스템 정보 파싱 오류:", e);
                    }
                });

                // 에이전트가 보낸 서비스 목록을 수신합니다.
                stompClient.subscribe(`${nodeTopic}.service`, (frame) => {
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

                if (canControlServices) {
                    stompClient.subscribe(`${nodeTopic}.service-control-result`, (frame) => {
                        if (!mounted) return;
                        try {
                            const result = JSON.parse(frame.body);
                            if (result.nodeId != null && String(result.nodeId) !== String(nodeId)) {
                                return;
                            }
                            setServiceControlResult({ ...result, _ts: Date.now() });
                            // 3초 후 결과 메시지 자동 제거
                            setTimeout(() => setServiceControlResult(null), 3000);
                        } catch (e) {
                            console.error("서비스 제어 결과 파싱 오류:", e);
                        }
                    });
                }

                if (canControlProcesses) {
                    stompClient.subscribe(`${nodeTopic}.process-kill-result`, (frame) => {
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
                }

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
            setIsConnected(false);
            setStompClient(null);
        };
    }, [nodeId, nodeAccessLoading, nodeAccess, canViewMonitoring, canControlServices, canControlProcesses]);

    // 작업관리자 탭이 활성화될 때 시스템 정보를 요청합니다.
    const handleRequestSystemInfo = useCallback(() => {
        if (!canViewMonitoring || !stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/system-info.request',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId) })
        );
    }, [canViewMonitoring, nodeId]);

    // task-manager 탭이 열리거나 연결이 완료됐을 때 systemInfo가 없으면 자동 요청합니다.
    useEffect(() => {
        if (canViewMonitoring && activeTab === 'task-manager' && !systemInfo && stompClientRef.current?.connected) {
            handleRequestSystemInfo();
        }
    }, [canViewMonitoring, activeTab, systemInfo, handleRequestSystemInfo, isConnected]);

    // task-manager 탭 활성 중 1초마다 systemInfo의 변동 값을 자동 갱신합니다.
    useEffect(() => {
        if (!canViewMonitoring || activeTab !== 'task-manager') return;
        const timer = setInterval(() => {
            if (stompClientRef.current?.connected) handleRequestSystemInfo();
        }, 1000);
        return () => clearInterval(timer);
    }, [canViewMonitoring, activeTab, handleRequestSystemInfo]);

    // 브라우저 WebSocket(STOMP)으로 에이전트에 서비스 제어 명령을 전송합니다.
    const handleServiceControl = useCallback((name, action) => {
        if (!canControlServices || !stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/node.service-control',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId), name, action })
        );
    }, [canControlServices, nodeId]);

    // 브라우저 WebSocket(STOMP)으로 에이전트에 kill 명령을 전송합니다.
    const handleKill = useCallback((pid) => {
        if (!canControlProcesses || !stompClientRef.current?.connected) return;
        stompClientRef.current.send(
            '/app/node.kill',
            {},
            JSON.stringify({ nodeId: parseInt(nodeId), pid })
        );
    }, [canControlProcesses, nodeId]);

    // 탭별 콘텐츠입니다. 프로세스/터미널 탭은 내부에서 스크롤을 처리하므로 overflow를 고정합니다.
    // process/services 탭은 테이블 가로 스크롤을 허용하기 위해 overflow-y-hidden만 적용합니다.
    return (
                <main className={`${activeTab === 'task-manager' ? 'container-fluid px-2 px-sm-3 px-md-4' : 'container p-2'} flex-grow-1 d-flex flex-column ${ ['process', 'services'].includes(activeTab) ? 'overflow-y-hidden mt-2' : ['terminal', 'task-manager'].includes(activeTab) ? 'overflow-hidden mt-2' : 'overflow-y-auto mt-2'}`} style={activeTab === 'task-manager' ? { maxWidth: 1600 } : {}}>
                    {nodeAccessDenied ? (
                        <div className="text-center mt-5 text-secondary">
                            <i className="bi bi-shield-lock d-block text-warning mb-3" style={{ fontSize: '2rem' }}></i>
                            <h5>접근 가능한 노드가 아닙니다.</h5>
                        </div>
                    ) : (
                    <>
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
                            canControlProcesses={canControlProcesses}
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
                                liveDisks={liveDiskDevices}
                                liveNetworks={liveNetworkInterfaces}
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
                            canUseTerminal={canUseTerminal}
                        />
                    </div>

                    {activeTab === 'services' && (
                        <Service
                            services={services}
                            isConnected={isConnected}
                            nodeName={serviceNodeName}
                            onControl={handleServiceControl}
                            controlResult={serviceControlResult}
                            canControlServices={canControlServices}
                        />
                    )}
                    </>
                    )}
                </main>
    );
}

export default DashBoard;
