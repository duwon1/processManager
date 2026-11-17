import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { useAppData } from '../context/AppDataContext';

const readThemeColor = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    return window.getComputedStyle(window.document.documentElement).getPropertyValue(name).trim() || fallback;
};

const TERMINAL_SHELL_OPTIONS = [
    { value: 'powershell', label: 'PowerShell', className: 'terminal-shell-powershell' },
    { value: 'cmd', label: 'CMD', className: 'terminal-shell-cmd' },
];

/**
 * xterm.js 기반 웹 터미널 컴포넌트입니다.
 * STOMP를 통해 에이전트의 PTY와 양방향 통신합니다.
 *
 * props:
 *   stompClient - 연결된 STOMP 클라이언트
 *   nodeId      - 대상 노드 ID
 *   isConnected - WebSocket 연결 상태
 */
function TerminalComponent({
    stompClient,
    nodeId,
    isConnected,
    visible,
    canUseTerminal = true,
    nodeOsType = '',
}) {
    const terminalRef = useRef(null);       // DOM 컨테이너
    const xtermRef = useRef(null);          // xterm 인스턴스
    const fitAddonRef = useRef(null);       // fit 애드온
    const sessionIdRef = useRef(null);      // 서버가 발급한 터미널 세션 ID
    const pendingRequestIdRef = useRef(null);            // 열기 요청 후 세션 ID 발급을 기다리는 요청 ID
    const abandonedRequestIdsRef = useRef(new Set());    // 발급 전에 취소한 요청 ID (발급되면 바로 닫음)
    const subscriptionRef = useRef(null);   // STOMP 구독
    const { profile } = useAppData();
    const userId = profile?.id;
    const lastSentSizeRef = useRef({ cols: 0, rows: 0 }); // 마지막으로 에이전트에 보낸 cols/rows (중복 resize 방지)
    const resizeTimerRef = useRef(null);    // resize 디바운스 타이머
    // stompClient를 ref로 관리해 xterm 이벤트 핸들러가 항상 최신 클라이언트를 참조합니다.
    const stompClientRef = useRef(stompClient);
    useEffect(() => { stompClientRef.current = stompClient; }, [stompClient]);
    const [status, setStatus] = useState('disconnected'); // connected | disconnected | connecting
    const [selectedShell, setSelectedShell] = useState('powershell');
    const isWindowsNode = String(nodeOsType || '').toLowerCase().includes('windows');

    // 열기 요청과 서버 응답을 짝짓는 ID입니다. 세션 ID 자체는 서버가 발급하므로 추측하기 어려울 필요는 없습니다.
    const generateRequestId = useCallback(() => {
        return `${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }, [nodeId]);

    // 터미널 탭이 실제로 보이는 상태에서 xterm 크기와 화면 렌더를 다시 맞춥니다.
    const fitAndRefresh = useCallback(() => {
        if (!canUseTerminal) return;
        const term = xtermRef.current;
        const fitAddon = fitAddonRef.current;
        if (!term || !fitAddon || terminalRef.current?.offsetParent === null) return;

        try {
            fitAddon.fit();
            term.refresh(0, Math.max(0, term.rows - 1));
        } catch {
            // 숨김 상태에서 표시 상태로 전환되는 순간에는 xterm 크기 계산이 일시적으로 실패할 수 있습니다.
        }
    }, [canUseTerminal]);

    // 터미널 세션 시작
    const openTerminalSession = useCallback((shellOverride = selectedShell) => {
        const client = stompClientRef.current;
        // 출력 구독이 준비되기 전에 열면 세션 ID 통지와 첫 출력을 놓치므로 구독 이후에만 엽니다.
        if (!canUseTerminal || !client?.connected || !subscriptionRef.current
                || !xtermRef.current || terminalRef.current?.offsetParent === null) return;

        const requestId = generateRequestId();
        pendingRequestIdRef.current = requestId;
        sessionIdRef.current = null;
        setStatus('connecting');

        const term = xtermRef.current;

        // 새 세션 시작 전 이전 출력과 ANSI 상태를 완전히 초기화합니다.
        term.reset();

        // fit()을 먼저 실행해 실제 컨테이너 크기에 맞는 cols/rows를 얻습니다.
        fitAndRefresh();
        const cols = term.cols;
        const rows = term.rows;
        client.publish({
            destination: '/app/terminal.open',
            body: JSON.stringify({
                requestId,
                nodeId: parseInt(nodeId),
                cols,
                rows,
                shell: isWindowsNode ? shellOverride : '',
            }),
        });
    }, [canUseTerminal, nodeId, selectedShell, isWindowsNode, generateRequestId, fitAndRefresh]);

    // 터미널 세션 종료
    const closeTerminalSession = useCallback(() => {
        // 세션 ID를 아직 못 받은 요청은 닫을 대상을 모르므로, 발급 통지가 오면 닫도록 표시해 둡니다.
        if (pendingRequestIdRef.current) {
            abandonedRequestIdsRef.current.add(pendingRequestIdRef.current);
            pendingRequestIdRef.current = null;
        }
        const client = stompClientRef.current;
        if (client?.connected && sessionIdRef.current) {
            client.publish({
                destination: '/app/terminal.close',
                body: JSON.stringify({
                    sessionId: sessionIdRef.current
                }),
            });
        }
        sessionIdRef.current = null;
        setStatus('disconnected');
    }, []);

    // 세션 ID 발급 통지와 터미널 출력은 본인만 구독할 수 있는 사용자 topic 하나로 옵니다.
    // 같은 계정의 다른 탭 출력도 함께 오므로 sessionId가 내 세션과 같을 때만 화면에 씁니다.
    useEffect(() => {
        if (!canUseTerminal || !isConnected || userId == null || !stompClient?.connected) return undefined;
        const subscription = stompClient.subscribe(`/topic/user.${userId}.terminal`, (frame) => {
            try {
                const message = JSON.parse(frame.body);
                if (message.requestId) {
                    if (message.requestId === pendingRequestIdRef.current) {
                        pendingRequestIdRef.current = null;
                        sessionIdRef.current = message.sessionId;
                    } else if (abandonedRequestIdsRef.current.delete(message.requestId)) {
                        stompClient.publish({
                            destination: '/app/terminal.close',
                            body: JSON.stringify({ sessionId: message.sessionId }),
                        });
                    }
                    return;
                }
                if (message.data && message.sessionId === sessionIdRef.current) {
                    setStatus('connected');
                    xtermRef.current?.write(message.data);
                }
            } catch (e) {
                console.error('터미널 출력 파싱 오류:', e);
            }
        });
        subscriptionRef.current = subscription;
        return () => {
            subscriptionRef.current = null;
            // 연결이 이미 끊겼다면 구독도 사라졌으므로 해제 요청을 보내지 않습니다.
            if (stompClient.connected) subscription.unsubscribe();
        };
    }, [canUseTerminal, isConnected, userId, stompClient]);

    // xterm 초기화
    useEffect(() => {
        if (!terminalRef.current) return;

        const terminalTheme = {
            background: readThemeColor('--pm-bg', '#0f1013'),
            foreground: readThemeColor('--pm-text', '#ffffff'),
            cursor: readThemeColor('--pm-primary', '#3182f6'),
            cursorAccent: readThemeColor('--pm-bg', '#0f1013'),
            selectionBackground: 'rgba(52, 133, 250, 0.28)',
            black: readThemeColor('--pm-bg', '#0f1013'),
            red: readThemeColor('--pm-danger', '#f04251'),
            green: readThemeColor('--pm-success', '#16bb76'),
            yellow: readThemeColor('--pm-warning', '#ffd43b'),
            blue: readThemeColor('--pm-primary', '#3182f6'),
            magenta: readThemeColor('--pm-gpu', '#ae3dd1'),
            cyan: readThemeColor('--pm-network-in', '#2eaab2'),
            white: readThemeColor('--pm-text', '#ffffff'),
            brightBlack: readThemeColor('--pm-text-muted', '#7e7e87'),
            brightRed: readThemeColor('--pm-danger', '#f04251'),
            brightGreen: readThemeColor('--pm-success', '#16bb76'),
            brightYellow: readThemeColor('--pm-warning', '#ffd43b'),
            brightBlue: readThemeColor('--pm-primary-hover', '#5a9cff'),
            brightMagenta: readThemeColor('--pm-gpu', '#ae3dd1'),
            brightCyan: readThemeColor('--pm-network-in', '#2eaab2'),
            brightWhite: readThemeColor('--pm-text', '#ffffff'),
        };

        const term = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
            theme: terminalTheme,
            scrollback: 5000,
            convertEol: true,
            allowProposedApi: true,
            screenReaderMode: false,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // 컨테이너에 맞게 크기 조절 — 숨김 상태(d-none)이면 스킵합니다.
        setTimeout(() => {
            if (terminalRef.current?.offsetParent !== null) {
                try {
                    fitAddon.fit();
                } catch {
                    // 최초 렌더 직후 컨테이너 크기가 아직 확정되지 않았으면 다음 표시 타이밍에 다시 맞춥니다.
                }
            }
        }, 100);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // 키 입력을 STOMP로 전송합니다. ref를 통해 항상 최신 stompClient를 참조합니다.
        term.onData((data) => {
            const client = stompClientRef.current;
            if (client?.connected && sessionIdRef.current) {
                client.publish({
                    destination: '/app/terminal.input',
                    body: JSON.stringify({
                        sessionId: sessionIdRef.current,
                        nodeId: parseInt(nodeId),
                        data
                    }),
                });
            }
        });

        // 브라우저 창 크기 변경 시 터미널 크기도 맞추고 에이전트에 알립니다.
        // 컨테이너가 d-none 상태(숨김)일 때는 크기가 0이므로 스킵합니다.
        // 입력 중에도 ResizeObserver가 연달아 발생하면 매번 fit()+resize 전송 → 에이전트가 프롬프트 줄을 다시
        // 그리며 타이핑 중인 글자를 순간적으로 지웁니다. 디바운스하고, 실제 cols/rows가 바뀐 경우에만 전송합니다.
        const handleResize = () => {
            if (terminalRef.current?.offsetParent === null) return;
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = setTimeout(() => {
                if (terminalRef.current?.offsetParent === null) return;
                fitAddon.fit();
                const cols = term.cols;
                const rows = term.rows;
                if (cols === lastSentSizeRef.current.cols && rows === lastSentSizeRef.current.rows) return;
                lastSentSizeRef.current = { cols, rows };
                const client = stompClientRef.current;
                if (client?.connected && sessionIdRef.current) {
                    client.publish({
                        destination: '/app/terminal.resize',
                        body: JSON.stringify({
                            sessionId: sessionIdRef.current,
                            nodeId: parseInt(nodeId),
                            cols,
                            rows
                        }),
                    });
                }
            }, 120);
        };

        const ro = new ResizeObserver(handleResize);
        ro.observe(terminalRef.current);

        return () => {
            closeTerminalSession();
            ro.disconnect();
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            term.dispose();
            xtermRef.current = null;
            fitAddonRef.current = null;
        };
    }, [canUseTerminal, nodeId, closeTerminalSession]); // stompClient는 의도적으로 제외 (재생성 방지)

    // WebSocket이 끊기면 서버 쪽 구독과 터미널 세션도 사라지므로 로컬 세션 정보를 비웁니다.
    // 재연결되면 아래 effect가 sessionIdRef가 비어 있는 것을 보고 새 세션을 엽니다.
    useEffect(() => {
        if (isConnected) return;
        sessionIdRef.current = null;
        pendingRequestIdRef.current = null;
        abandonedRequestIdsRef.current.clear();
    }, [isConnected]);

    // 탭이 다시 보일 때 터미널 크기를 재계산합니다. (d-none → 표시 시 컨테이너 크기 변경)
    useEffect(() => {
        if (!visible || !canUseTerminal) return;

        const timer = setTimeout(() => {
            // 터미널이 화면에 보인 뒤 세션을 열어 xterm이 0 크기 상태로 초기화되는 문제를 막습니다.
            fitAndRefresh();
            if (isConnected && stompClientRef.current?.connected && xtermRef.current
                    && !sessionIdRef.current && !pendingRequestIdRef.current) {
                openTerminalSession();
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [visible, canUseTerminal, isConnected, userId, fitAndRefresh, openTerminalSession]);

    // 재연결 버튼 핸들러
    const handleReconnect = () => {
        if (!canUseTerminal) return;
        closeTerminalSession();
        setTimeout(() => openTerminalSession(), 300);
    };

    const handleShellChange = (shell) => {
        if (!canUseTerminal || shell === selectedShell) return;
        closeTerminalSession();
        setSelectedShell(shell);
    };

    // 연결이 끊긴 동안에는 마지막 세션 상태와 관계없이 끊김으로 표시합니다.
    const displayStatus = isConnected ? status : 'disconnected';

    if (!canUseTerminal) {
        return (
            <div className="d-flex align-items-center justify-content-center flex-grow-1 text-secondary border border-secondary border-opacity-25 rounded">
                터미널 접근 권한이 없습니다.
            </div>
        );
    }

    return (
        <div className="d-flex flex-column flex-grow-1 overflow-hidden">
            {/* 터미널 상단 바 */}
            <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-50"
                 style={{ backgroundColor: 'var(--pm-surface-raised)' }}>
                <div className="d-flex align-items-center gap-2">
                    <span className={`rounded-circle d-inline-block`}
                          style={{
                              width: 8, height: 8,
                              backgroundColor: displayStatus === 'connected' ? 'var(--bs-success)' :
                                  displayStatus === 'connecting' ? 'var(--bs-warning)' : 'var(--bs-danger)'
                          }} />
                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                        {displayStatus === 'connected' ? '연결됨' : displayStatus === 'connecting' ? '연결 중...' : '연결 끊김'}
                    </span>
                </div>

                <div className="d-flex align-items-center gap-2">
                    {isWindowsNode && (
                        <div className="btn-group btn-group-sm" role="group" aria-label="터미널 셸 선택">
                            {TERMINAL_SHELL_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`terminal-shell-button ${option.className} ${selectedShell === option.value ? 'terminal-shell-button-active' : ''}`}
                                    onClick={() => handleShellChange(option.value)}
                                    disabled={!isConnected}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button className="btn btn-outline-info btn-sm py-0 px-2"
                            style={{ fontSize: '0.75rem' }}
                            onClick={handleReconnect}
                            disabled={!isConnected}>
                        재연결
                    </button>
                </div>
            </div>

            <div ref={terminalRef}
                 className="flex-grow-1"
                 style={{
                     backgroundColor: 'var(--pm-bg)',
                     padding: '4px',
                     minHeight: 0,
                 }} />
        </div>
    );
}

export default TerminalComponent;
