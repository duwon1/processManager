import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

/**
 * xterm.js 기반 웹 터미널 컴포넌트입니다.
 * STOMP를 통해 에이전트의 PTY와 양방향 통신합니다.
 *
 * props:
 *   stompClient - 연결된 STOMP 클라이언트
 *   nodeId      - 대상 노드 ID
 *   isConnected - WebSocket 연결 상태
 */
function TerminalComponent({ stompClient, nodeId, isConnected, visible }) {
    const terminalRef = useRef(null);       // DOM 컨테이너
    const xtermRef = useRef(null);          // xterm 인스턴스
    const fitAddonRef = useRef(null);       // fit 애드온
    const sessionIdRef = useRef(null);      // 터미널 세션 ID
    const subscriptionRef = useRef(null);   // STOMP 구독
    // stompClient를 ref로 관리해 xterm 이벤트 핸들러가 항상 최신 클라이언트를 참조합니다.
    const stompClientRef = useRef(stompClient);
    useEffect(() => { stompClientRef.current = stompClient; }, [stompClient]);
    const [status, setStatus] = useState('disconnected'); // connected | disconnected | connecting

    // 고유 터미널 세션 ID 생성
    const generateSessionId = useCallback(() => {
        return `term-${nodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }, [nodeId]);

    // 터미널 세션 시작
    const openTerminalSession = useCallback(() => {
        const client = stompClientRef.current;
        if (!client?.connected || !xtermRef.current) return;

        const termSessionId = generateSessionId();
        sessionIdRef.current = termSessionId;
        setStatus('connecting');

        const term = xtermRef.current;
        const fitAddon = fitAddonRef.current;

        // 새 세션 시작 전 이전 출력과 ANSI 상태를 완전히 초기화합니다.
        term.reset();

        // 에이전트 출력을 구독합니다.
        subscriptionRef.current = client.subscribe(
            `/topic/terminal.output.${termSessionId}`,
            (frame) => {
                try {
                    const output = JSON.parse(frame.body);
                    if (output.data) {
                        term.write(output.data);
                    }
                } catch (e) {
                    console.error('터미널 출력 파싱 오류:', e);
                }
            }
        );

        // fit()을 먼저 실행해 실제 컨테이너 크기에 맞는 cols/rows를 얻습니다.
        if (fitAddon) fitAddon.fit();
        const cols = term.cols;
        const rows = term.rows;
        client.send('/app/terminal.open', {}, JSON.stringify({
            sessionId: termSessionId,
            nodeId: parseInt(nodeId),
            cols,
            rows
        }));

        setStatus('connected');
    }, [nodeId, generateSessionId]);

    // 터미널 세션 종료
    const closeTerminalSession = useCallback(() => {
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }
        const client = stompClientRef.current;
        if (client?.connected && sessionIdRef.current) {
            client.send('/app/terminal.close', {}, JSON.stringify({
                sessionId: sessionIdRef.current
            }));
        }
        sessionIdRef.current = null;
        setStatus('disconnected');
    }, []);

    // xterm 초기화
    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
            theme: {
                background: '#1a1a2e',
                foreground: '#e0e0e0',
                cursor: '#00d4ff',
                cursorAccent: '#1a1a2e',
                selectionBackground: 'rgba(0, 212, 255, 0.3)',
                black: '#1a1a2e',
                red: '#ff6b6b',
                green: '#51cf66',
                yellow: '#fcc419',
                blue: '#339af0',
                magenta: '#cc5de8',
                cyan: '#22b8cf',
                white: '#e0e0e0',
                brightBlack: '#495057',
                brightRed: '#ff8787',
                brightGreen: '#69db7c',
                brightYellow: '#ffd43b',
                brightBlue: '#5c7cfa',
                brightMagenta: '#da77f2',
                brightCyan: '#3bc9db',
                brightWhite: '#ffffff',
            },
            scrollback: 5000,
            convertEol: true,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // 컨테이너에 맞게 크기 조절 — 숨김 상태(d-none)이면 스킵합니다.
        setTimeout(() => {
            if (terminalRef.current?.offsetParent !== null) {
                try { fitAddon.fit(); } catch (_) {}
            }
        }, 100);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // 키 입력을 STOMP로 전송합니다. ref를 통해 항상 최신 stompClient를 참조합니다.
        term.onData((data) => {
            const client = stompClientRef.current;
            if (client?.connected && sessionIdRef.current) {
                client.send('/app/terminal.input', {}, JSON.stringify({
                    sessionId: sessionIdRef.current,
                    nodeId: parseInt(nodeId),
                    data
                }));
            }
        });

        // 브라우저 창 크기 변경 시 터미널 크기도 맞추고 에이전트에 알립니다.
        // 컨테이너가 d-none 상태(숨김)일 때는 크기가 0이므로 스킵합니다.
        const handleResize = () => {
            if (terminalRef.current?.offsetParent === null) return;
            fitAddon.fit();
            const client = stompClientRef.current;
            if (client?.connected && sessionIdRef.current) {
                client.send('/app/terminal.resize', {}, JSON.stringify({
                    sessionId: sessionIdRef.current,
                    nodeId: parseInt(nodeId),
                    cols: term.cols,
                    rows: term.rows
                }));
            }
        };

        const ro = new ResizeObserver(handleResize);
        ro.observe(terminalRef.current);

        return () => {
            ro.disconnect();
            term.dispose();
            xtermRef.current = null;
            fitAddonRef.current = null;
        };
    }, [nodeId]); // stompClient는 의도적으로 제외 (재생성 방지)

    // 탭이 다시 보일 때 터미널 크기를 재계산합니다. (d-none → 표시 시 컨테이너 크기 변경)
    useEffect(() => {
        if (visible && fitAddonRef.current && xtermRef.current) {
            setTimeout(() => {
                // 콜백 시점에 ref가 살아있고 컨테이너가 실제로 보이는지 재확인합니다.
                if (fitAddonRef.current && xtermRef.current && terminalRef.current?.offsetParent !== null) {
                    try { fitAddonRef.current.fit(); } catch (_) {}
                }
            }, 50);
        }
    }, [visible]);

    // STOMP 연결 상태 변경 시 세션 관리
    useEffect(() => {
        if (isConnected && stompClient?.connected && xtermRef.current && !sessionIdRef.current) {
            openTerminalSession();
        }
        return () => {
            closeTerminalSession();
        };
    }, [isConnected, openTerminalSession, closeTerminalSession]);

    // 재연결 버튼 핸들러
    const handleReconnect = () => {
        closeTerminalSession();
        setTimeout(() => openTerminalSession(), 300);
    };

    return (
        <div className="d-flex flex-column flex-grow-1 overflow-hidden">
            {/* 터미널 상단 바 */}
            <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-50"
                 style={{ backgroundColor: '#16163a' }}>
                <div className="d-flex align-items-center gap-2">
                    {/* 연결 상태 표시 */}
                    <span className={`rounded-circle d-inline-block`}
                          style={{
                              width: 8, height: 8,
                              backgroundColor: status === 'connected' ? 'var(--bs-success)' :
                                  status === 'connecting' ? 'var(--bs-warning)' : 'var(--bs-danger)'
                          }} />
                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                        {status === 'connected' ? '연결됨' :
                         status === 'connecting' ? '연결 중...' : '연결 끊김'}
                    </span>
                </div>

                <div className="d-flex gap-2">
                    {/* 재연결 버튼 */}
                    <button className="btn btn-outline-info btn-sm py-0 px-2"
                            style={{ fontSize: '0.75rem' }}
                            onClick={handleReconnect}
                            disabled={!isConnected}>
                        재연결
                    </button>
                </div>
            </div>

            {/* xterm 터미널 영역 */}
            <div ref={terminalRef}
                 className="flex-grow-1"
                 style={{
                     backgroundColor: '#1a1a2e',
                     padding: '4px',
                     minHeight: 0, // flex-grow-1과 함께 사용 시 오버플로우 방지
                 }} />
        </div>
    );
}

export default TerminalComponent;
