import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import './Terminal.css';

const readThemeColor = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    return window.getComputedStyle(window.document.documentElement).getPropertyValue(name).trim() || fallback;
};

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
    canViewFiles = true,
}) {
    const terminalRef = useRef(null);       // DOM 컨테이너
    const xtermRef = useRef(null);          // xterm 인스턴스
    const fitAddonRef = useRef(null);       // fit 애드온
    const sessionIdRef = useRef(null);      // 터미널 세션 ID
    const subscriptionRef = useRef(null);   // STOMP 구독
    const fileListSubscriptionRef = useRef(null); // 파일 목록 STOMP 구독
    const filePathRef = useRef(''); // 현재 파일 목록 경로를 재요청할 때 사용합니다.
    // stompClient를 ref로 관리해 xterm 이벤트 핸들러가 항상 최신 클라이언트를 참조합니다.
    const stompClientRef = useRef(stompClient);
    useEffect(() => { stompClientRef.current = stompClient; }, [stompClient]);
    const [status, setStatus] = useState('disconnected'); // connected | disconnected | connecting
    const [filePath, setFilePath] = useState('');
    const [fileParent, setFileParent] = useState('');
    const [fileEntries, setFileEntries] = useState([]);
    const [fileError, setFileError] = useState('');
    const [fileLoading, setFileLoading] = useState(false);

    // 고유 터미널 세션 ID 생성
    const generateSessionId = useCallback(() => {
        return `term-${nodeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    const openTerminalSession = useCallback(() => {
        const client = stompClientRef.current;
        if (!canUseTerminal || !client?.connected || !xtermRef.current || terminalRef.current?.offsetParent === null) return;

        const termSessionId = generateSessionId();
        sessionIdRef.current = termSessionId;
        setStatus('connecting');

        const term = xtermRef.current;

        // 새 세션 시작 전 이전 출력과 ANSI 상태를 완전히 초기화합니다.
        term.reset();

        // 에이전트 출력을 구독합니다.
        subscriptionRef.current = client.subscribe(
            `/topic/node.${nodeId}.terminal.output.${termSessionId}`,
            (frame) => {
                try {
                    const output = JSON.parse(frame.body);
                    if (output.data) {
                        setStatus('connected');
                        term.write(output.data);
                    }
                } catch (e) {
                    console.error('터미널 출력 파싱 오류:', e);
                }
            }
        );

        // fit()을 먼저 실행해 실제 컨테이너 크기에 맞는 cols/rows를 얻습니다.
        fitAndRefresh();
        const cols = term.cols;
        const rows = term.rows;
        client.send('/app/terminal.open', {}, JSON.stringify({
            sessionId: termSessionId,
            nodeId: parseInt(nodeId),
            cols,
            rows
        }));

        // 에이전트 출력이 도착하기 전까지는 연결 요청 상태로 표시합니다.
        setStatus('connecting');
    }, [canUseTerminal, nodeId, generateSessionId, fitAndRefresh]);

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

    // 지정한 Linux 경로의 파일 목록을 에이전트에 요청합니다. 읽기 전용 목록 조회만 수행합니다.
    const requestFileList = useCallback((path = '') => {
        const client = stompClientRef.current;
        if (!canViewFiles || !client?.connected || !nodeId) return;
        setFileLoading(true);
        setFileError('');
        client.send('/app/file-list.request', {}, JSON.stringify({
            nodeId: parseInt(nodeId),
            path
        }));
    }, [canViewFiles, nodeId]);

    // 파일 목록 결과 채널을 구독합니다. 노드별 채널이라 다른 노드 결과와 섞이지 않습니다.
    useEffect(() => {
        const client = stompClientRef.current;
        if (!canViewFiles || !visible || !isConnected || !client?.connected || !nodeId) return;

        if (!fileListSubscriptionRef.current) {
            fileListSubscriptionRef.current = client.subscribe(
                `/topic/node.${nodeId}.file-list`,
                (frame) => {
                    try {
                        const payload = JSON.parse(frame.body);
                        filePathRef.current = payload.path || '';
                        setFilePath(payload.path || '');
                        setFileParent(payload.parent || '');
                        setFileEntries(Array.isArray(payload.entries) ? payload.entries : []);
                        setFileError(payload.error || '');
                    } catch (e) {
                        setFileError(`파일 목록 파싱 오류: ${e.message}`);
                    } finally {
                        setFileLoading(false);
                    }
                }
            );
        }

        requestFileList(filePathRef.current);

        return () => {
            if (fileListSubscriptionRef.current) {
                fileListSubscriptionRef.current.unsubscribe();
                fileListSubscriptionRef.current = null;
            }
        };
    }, [canViewFiles, visible, isConnected, nodeId, requestFileList]); // filePath는 최초 요청값으로만 사용합니다.

    // xterm 초기화
    useEffect(() => {
        if (!canUseTerminal) {
            closeTerminalSession();
            return;
        }
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
            closeTerminalSession();
            ro.disconnect();
            term.dispose();
            xtermRef.current = null;
            fitAddonRef.current = null;
        };
    }, [canUseTerminal, nodeId, closeTerminalSession]); // stompClient는 의도적으로 제외 (재생성 방지)

    // 탭이 다시 보일 때 터미널 크기를 재계산합니다. (d-none → 표시 시 컨테이너 크기 변경)
    useEffect(() => {
        if (!visible || !canUseTerminal) return;

        const timer = setTimeout(() => {
            // 터미널이 화면에 보인 뒤 세션을 열어 xterm이 0 크기 상태로 초기화되는 문제를 막습니다.
            fitAndRefresh();
            if (isConnected && stompClientRef.current?.connected && xtermRef.current && !sessionIdRef.current) {
                openTerminalSession();
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [visible, canUseTerminal, isConnected, fitAndRefresh, openTerminalSession]);

    // 재연결 버튼 핸들러
    const handleReconnect = () => {
        if (!canUseTerminal) return;
        closeTerminalSession();
        setTimeout(() => openTerminalSession(), 300);
    };

    const formatFileSize = (size) => {
        if (!Number.isFinite(size) || size <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = size;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    };

    // 파일 종류에 맞는 시각 아이콘 정보를 계산합니다.
    const getFileVisual = (entry) => {
        if (entry.type === 'directory') {
            return { className: 'terminal-file-icon--folder', label: '폴더' };
        }
        if (entry.type === 'unknown') {
            return { className: 'terminal-file-icon--unknown', label: '알 수 없음' };
        }

        const extension = entry.name.split('.').pop()?.toLowerCase() ?? '';
        const imageTypes = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
        const codeTypes = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'sh', 'json', 'xml', 'html', 'css', 'yml', 'yaml']);
        const archiveTypes = new Set(['zip', 'tar', 'gz', 'tgz', 'rar', '7z']);
        const executableTypes = new Set(['exe', 'msi', 'bat', 'cmd', 'run', 'bin']);

        if (imageTypes.has(extension)) return { className: 'terminal-file-icon--image', label: '이미지 파일' };
        if (codeTypes.has(extension)) return { className: 'terminal-file-icon--code', label: '코드 파일' };
        if (archiveTypes.has(extension)) return { className: 'terminal-file-icon--archive', label: '압축 파일' };
        if (executableTypes.has(extension)) return { className: 'terminal-file-icon--executable', label: '실행 파일' };
        return { className: 'terminal-file-icon--file', label: '파일' };
    };

    const openDirectory = (entry) => {
        if (entry.type !== 'directory') return;
        requestFileList(entry.path);
    };

    if (!canUseTerminal && !canViewFiles) {
        return (
            <div className="d-flex align-items-center justify-content-center flex-grow-1 text-secondary border border-secondary border-opacity-25 rounded">
                접근 가능한 터미널 기능이 없습니다.
            </div>
        );
    }

    return (
        <div className="d-flex flex-column flex-grow-1 overflow-hidden">
            {/* 터미널 상단 바 */}
            <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-50"
                 style={{ backgroundColor: 'var(--pm-surface-raised)' }}>
                <div className="d-flex align-items-center gap-2">
                    {canUseTerminal ? (
                        <span className={`rounded-circle d-inline-block`}
                              style={{
                                  width: 8, height: 8,
                                  backgroundColor: status === 'connected' ? 'var(--bs-success)' :
                                      status === 'connecting' ? 'var(--bs-warning)' : 'var(--bs-danger)'
                              }} />
                    ) : (
                        <i className="bi bi-folder2-open text-info"></i>
                    )}
                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>
                        {canUseTerminal
                            ? (status === 'connected' ? '연결됨' : status === 'connecting' ? '연결 중...' : '연결 끊김')
                            : '파일 보기'}
                    </span>
                </div>

                <div className="d-flex gap-2">
                    {canUseTerminal && (
                        <button className="btn btn-outline-info btn-sm py-0 px-2"
                                style={{ fontSize: '0.75rem' }}
                                onClick={handleReconnect}
                                disabled={!isConnected}>
                            재연결
                        </button>
                    )}
                </div>
            </div>

            <div className="d-flex flex-column flex-lg-row flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                {/* Linux 파일 목록 패널입니다. 현재는 읽기 전용 디렉토리 탐색만 제공합니다. */}
                {canViewFiles && (
                <aside className={`terminal-file-panel ${!canUseTerminal ? 'terminal-file-panel-wide' : ''} d-flex flex-column border-end border-secondary border-opacity-50`}>
                    <div className="px-3 py-2 border-bottom border-secondary border-opacity-50">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                            <span className="text-info fw-semibold" style={{ fontSize: '0.82rem' }}>파일</span>
                            <button className="btn btn-outline-info btn-sm py-0 px-2"
                                    style={{ fontSize: '0.72rem' }}
                                    onClick={() => requestFileList(filePath)}
                                    disabled={!isConnected || fileLoading}>
                                새로고침
                            </button>
                        </div>
                        <div className="text-secondary text-truncate mt-1" title={filePath || '홈 디렉토리'}
                             style={{ fontSize: '0.72rem' }}>
                            {filePath || '홈 디렉토리'}
                        </div>
                    </div>

                    <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
                        {fileParent && (
                            <button type="button"
                                    className="terminal-file-row w-100 d-flex align-items-center gap-2 px-3 py-2 border-0 text-start text-secondary"
                                    onClick={() => requestFileList(fileParent)}>
                                <span className="terminal-file-icon terminal-file-icon--parent flex-shrink-0"
                                      aria-label="상위 폴더"
                                      title="상위 폴더" />
                                <span className="text-truncate">상위 폴더</span>
                            </button>
                        )}

                        {fileLoading && (
                            <div className="px-3 py-3 text-secondary" style={{ fontSize: '0.8rem' }}>
                                불러오는 중...
                            </div>
                        )}

                        {!fileLoading && fileError && (
                            <div className="px-3 py-3 text-warning" style={{ fontSize: '0.8rem' }}>
                                {fileError}
                            </div>
                        )}

                        {!fileLoading && !fileError && fileEntries.length === 0 && (
                            <div className="px-3 py-3 text-secondary" style={{ fontSize: '0.8rem' }}>
                                표시할 파일이 없습니다.
                            </div>
                        )}

                        {!fileLoading && !fileError && fileEntries.map((entry) => {
                            const visual = getFileVisual(entry);
                            return (
                                <button type="button"
                                        key={`${entry.type}-${entry.path}`}
                                        className={`terminal-file-row w-100 d-flex align-items-center gap-2 px-3 py-2 border-0 text-start ${entry.hidden ? 'terminal-file-row--hidden' : ''}`}
                                        style={{
                                            color: entry.type === 'directory' ? 'var(--pm-text)' : 'var(--pm-text-secondary)',
                                            cursor: entry.type === 'directory' ? 'pointer' : 'default',
                                        }}
                                        title={`${visual.label}: ${entry.path}`}
                                        onClick={() => openDirectory(entry)}>
                                    <span className={`terminal-file-icon ${visual.className} flex-shrink-0`}
                                          aria-label={visual.label}
                                          title={visual.label} />
                                    <span className="text-truncate flex-grow-1">{entry.name}</span>
                                    {entry.hidden && (
                                        <span className="terminal-file-badge flex-shrink-0">숨김</span>
                                    )}
                                    {entry.type !== 'directory' && (
                                        <span className="text-secondary flex-shrink-0" style={{ fontSize: '0.72rem' }}>
                                            {formatFileSize(Number(entry.size))}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </aside>
                )}

                {/* xterm 터미널 영역 */}
                {canUseTerminal && (
                    <div ref={terminalRef}
                         className="flex-grow-1"
                         style={{
                             backgroundColor: 'var(--pm-bg)',
                             padding: '4px',
                             minHeight: 0, // flex-grow-1과 함께 사용 시 오버플로우 방지
                         }} />
                )}
            </div>
        </div>
    );
}

export default TerminalComponent;
