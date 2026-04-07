import React from 'react';

// props로 metrics를 받아오도록 수정했습니다.
function Monitoring({ metrics }) {

    // 부모로부터 데이터가 아직 오지 않았을 때 보여줄 화면
    if (!metrics || metrics.length === 0) {
        return <div className="text-white text-center py-5">데이터 수신 대기 중...</div>;
    }

    return (
        <>
            {/* ── PC (md 이상): md 3열 → lg 6열, 원래 카드 크기 ── */}
            <div className="d-none d-md-block">
                <div className="row row-cols-md-3 row-cols-lg-6 g-4">
                    {metrics.filter(d => d.id <= 6).map((data, index) => (
                        <div className="col" key={data.id != null ? data.id : index}>
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
            </div>

            {/* ── 모바일 (md 미만): 2열, 컴팩트 카드 ── */}
            <div className="d-block d-md-none">
                <div className="row row-cols-2 g-2">
                    {metrics.filter(d => d.id <= 6).map((data, index) => (
                        <div className="col" key={data.id != null ? data.id : index}>
                            <div className="card shadow-sm h-100 bg-dark text-white border-secondary border-opacity-50">
                                <div className="card-body py-2 px-3">
                                    {/* 지표 제목 (예: CPU 사용률) */}
                                    <h6 className="card-title text-info mb-1" style={{ fontSize: '0.75rem' }}>{data.title}</h6>
                                    {/* 지표 값 (예: 11.9%) */}
                                    <p className="card-text fs-5 fw-bold mb-0">{data.value}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

export default Monitoring;
