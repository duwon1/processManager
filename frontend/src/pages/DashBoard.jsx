import React, { useState, useEffect } from 'react';
import SideBar from "../components/SideBar";
import Header from "../components/Header";

function DashBoard() {
    const [metrics, setMetrics] = useState([]);
    const [isConnected, setIsConnected] = useState(false); // 연결 상태 표시용

    useEffect(() => {
        // 1. 스프링 부트 웹소켓 서버 주소로 연결합니다. (포트와 엔드포인트는 스프링 설정에 맞게 변경하세요!)
        const ws = new WebSocket("ws://localhost:8080/ws/system-metrics");

        // 2. 연결이 성공적으로 맺어졌을 때 실행됩니다.
        ws.onopen = () => {
            console.log("웹소켓 서버에 연결되었습니다! 🚀");
            setIsConnected(true);
        };

        // 3. 스프링 서버에서 데이터를 쏴줄 때마다 실행됩니다. (핵심 부분 ⭐️)
        ws.onmessage = (event) => {
            try {
                // 스프링에서 보낸 JSON 문자열을 자바스크립트 객체(배열)로 변환합니다.
                const realTimeData = JSON.parse(event.data);

                // 변환된 데이터를 리액트 상태에 넣어서 화면을 즉시 업데이트합니다.
                setMetrics(realTimeData);
            } catch (error) {
                console.error("데이터 파싱 오류:", error);
            }
        };

        // 4. 연결이 끊어지거나 에러가 났을 때 처리합니다.
        ws.onclose = () => {
            console.log("웹소켓 연결이 종료되었습니다.");
            setIsConnected(false);
        };

        // 5. 컴포넌트가 화면에서 사라질 때(Unmount) 연결을 안전하게 끊어줍니다. (메모리 누수 방지)
        return () => {
            if (ws.readyState === 1) { // 1 = OPEN
                ws.close();
            }
        };
    }, []); // 빈 배열을 넣어 한 번만 연결되게 합니다.

    return (
        <div className="d-flex vh-100 overflow-hidden">
            <SideBar />

            <div className="d-flex flex-column flex-grow-1">
                <Header />

                <main className="container mt-5 p-2 flex-grow-1 overflow-y-auto">

                    {/* 상단: 연결 상태를 작게 표시해줍니다 (디버깅용) */}
                    <div className="d-flex justify-content-end mb-3">
                        <span className={`badge ${isConnected ? 'bg-success' : 'bg-danger'}`}>
                            {isConnected ? 'LIVE 서버 연결됨 🟢' : '서버 연결 끊김 🔴'}
                        </span>
                    </div>

                    {/* 데이터가 아직 안 들어왔을 때 로딩 화면 */}
                    {metrics.length === 0 ? (
                        <div className="text-center mt-5 text-secondary">
                            <div className="spinner-border mb-3" role="status"></div>
                            <h5>서버로부터 데이터를 기다리는 중입니다...</h5>
                        </div>
                    ) : (
                        // 데이터가 들어오면 6개의 카드를 그려냅니다.
                        <div className="row row-cols-xl-6 row-cols-sm-3 g-4">
                            {metrics.map((data, index) => (
                                // 만약 스프링에서 id를 안 보내준다면 index를 key로 씁니다.
                                <div className="col" key={data.id || index}>
                                    <div className="card shadow-sm h-100 bg-dark text-white border-secondary border-opacity-50">
                                        <div className="card-body">
                                            <h5 className="card-title text-info fs-6">{data.title}</h5>
                                            <p className="card-text fs-4 fw-bold">{data.value}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}

export default DashBoard;