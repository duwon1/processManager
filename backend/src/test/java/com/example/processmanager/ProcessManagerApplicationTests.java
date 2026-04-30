package com.example.processmanager;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// WebSocket 서버 컨테이너까지 실제 서블릿 환경으로 로딩되는지 확인합니다.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProcessManagerApplicationTests {

    @Test
    void contextLoads() {
    }

}
