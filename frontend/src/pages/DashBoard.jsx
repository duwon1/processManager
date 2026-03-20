import React from 'react';
import SideBar from "../components/SideBar"; // 경로에 맞게 수정해주세요
import Header from "../components/Header";   // 경로에 맞게 수정해주세요

function DashBoard() {
    return (
        // d-flex: 가로로 배치, vh-100: 화면 높이 100%, overflow-hidden: 전체 화면 스크롤 방지
        <div className="d-flex vh-100 overflow-hidden">

            {/* 1. 좌측 영역: 사이드바 */}
            <SideBar />

            {/* 2. 우측 영역: 헤더 + 메인 컨텐츠 */}
            {/* flex-column: 세로 배치, flex-grow-1: 남은 우측 공간 모두 차지 */}
            <div className="d-flex flex-column flex-grow-1">

                {/* 상단: 헤더 */}
                <Header />

                {/* 하단: 메인 컨텐츠 영역 */}
                {/* flex-grow-1: 헤더가 쓰고 남은 세로 공간 모두 차지, overflow-y-auto: 내용이 길면 이 부분만 스크롤 */}
                <main className="container mt-5 p-4">
                    <div className="row-cols-5">
                        <div className="border border-1 border-primary">
                            d
                        </div>

                        <div>
                        </div>

                        <div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}

export default DashBoard;