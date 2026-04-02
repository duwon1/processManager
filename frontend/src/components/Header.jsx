import React from 'react';

function Header() {
    return (
        // marginLeft: '280px' 인라인 스타일 완전 삭제! 순수 부트스트랩 클래스 유지
        <nav className="navbar navbar-expand-lg" data-bs-theme="dark">
            <div className="container-fluid">
                {/* CPU, GPU, MEM 그래프 영역 */}

                <button className="navbar-toggler" type="button" data-bs-toggle="collapse"
                        data-bs-target="#navbarColor01" aria-controls="navbarColor01" aria-expanded="false"
                        aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="navbarColor01">
                    <ul className="navbar-nav me-auto">
                        <li className="nav-item">
                            <a className="nav-link" href="#">모니터링</a>
                        </li>
                        <li className="nav-item">
                            <a className="nav-link" href="#">프로세스</a>
                        </li>
                        <li className="nav-item">
                            <a className="nav-link" href="#">작업관리자</a>
                        </li>
                        <li className="nav-item">
                            <a className="nav-link" href="#">서비스</a>
                        </li>
                        <li className="nav-item">
                            <a className="nav-link" href="#">터미널(SSH)</a>
                        </li>
                    </ul>
                    <form className="d-flex">
                        <input className="form-control me-sm-2" type="search" placeholder="Search"/>
                        <button className="btn btn-secondary my-2 my-sm-0" type="submit">Search</button>
                    </form>
                </div>
            </div>
        </nav>
    )
}

export default Header;