import React from 'react';

// props로 metrics를 받아오도록 수정했습니다.
function Monitoring({ metrics }) {

    // 부모로부터 데이터가 아직 오지 않았을 때 보여줄 화면
    if (!metrics || metrics.length === 0) {
        return <div className="text-white text-center py-5">데이터 수신 대기 중...</div>;
    }

    return (
        <div className="row row-cols-xl-6 row-cols-sm-3 g-4">
            {metrics.map((data, index) => (
                <div className="col" key={data.id || index}>
                    <div className="card shadow-sm h-100 bg-dark text-white border-secondary border-opacity-50">
                        <div className="card-body">
                            {/* 지표 제목 (예: CPU 사용률) */}
                            <h5 className="card-title text-info fs-6">{data.title}</h5>
                            {/* 지표 값 (예: 11.9%) */}
                            <p className="card-text fs-4 fw-bold">{data.value}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default Monitoring;