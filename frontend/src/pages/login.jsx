import { useEffect, useState } from 'react'
import GoogleLoginButton from '../components/GoogleLoginButton';

function Login() {

    return (

        <div className="container-lg bg-primary justify-content-center align-content-center py-4" style={{maxWidth:'600px'}}>
            <header className="text-center">
                <h2 className="text-primary-emphasis fw-bold p-4">리소스 모니터</h2>
            </header>
            <main className="row g-2 mb-4">
                <div className="col-12 col-sm-6">
                    <div className="card card-body h-100">
                        <h5 className="card-title">실시간 모니터링</h5>
                        <p className="card-text text-light">내 PC의 상태를 실시간으로 확인하세요
                            각종 컴퓨터의 자원을 차트로 표시합니다.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body h-100">
                        <h5 className="card-title">통합관리 시스템</h5>
                        <p className="card-text text-light">여러 PC를 하나의 웹서비스로 통합하여 관리하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body h-100">
                        <h5 className="card-title">프로세스 관리</h5>
                        <p className="card-text text-light">PC에서 실행중인 프로세스들을 한눈에 확인하고 관리하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body h-100">
                        <h5 className="card-title">원격 터미널(SSH)</h5>
                        <p className="card-text text-light">웹서비스에서 원격으로 터미널에 접근하세요.</p>
                    </div>
                </div>

                <div className="col-12 col-sm-6">
                    <div className="card card-body h-100">
                        <h5 className="card-title">서비스 제어</h5>
                        <p className="card-text text-light">시스템 서비스를 관리하세요.</p>
                    </div>
                </div>

            </main>

            <footer className="my-4">
                {/*  소셜로그인  */}
                <GoogleLoginButton />
            </footer>
        </div>
    )
}

export default Login;