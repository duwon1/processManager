package com.example.processmanager.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * prod 환경에서는 SSH 터널 대신 TiDB에 직접 연결합니다.
 * DatabaseMigrationConfig의 @DependsOn("sshTunnelConfig")가 깨지지 않도록
 * 같은 이름의 빈을 placeholder로 등록합니다.
 */
@Configuration
@Profile("prod")
public class SshTunnelNoOpConfig {

    private static final Logger log = LoggerFactory.getLogger(SshTunnelNoOpConfig.class);

    @Bean("sshTunnelConfig")
    public Object noOpSshTunnel() {
        log.info("ℹ️ 운영 환경: SSH 터널 사용 안 함 (TiDB Serverless 직접 연결)");
        return new Object();
    }
}