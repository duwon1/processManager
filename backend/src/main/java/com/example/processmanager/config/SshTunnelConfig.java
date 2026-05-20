package com.example.processmanager.config;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

// prod 환경에서는 TiDB 직접 연결을 사용하므로 SSH 터널이 불필요합니다.
@Configuration
@Profile("!prod")
@ConditionalOnProperty(name = "ssh.enabled", havingValue = "true", matchIfMissing = true)
public class SshTunnelConfig {

    private static final Logger log = LoggerFactory.getLogger(SshTunnelConfig.class);

    @Value("${ssh.host}")
    private String sshHost;

    @Value("${ssh.port}")
    private int sshPort;

    @Value("${ssh.username}")
    private String sshUsername;

    @Value("${ssh.password}")
    private String sshPassword;

    @Value("${ssh.remote-db-host}")
    private String remoteDbHost;

    @Value("${ssh.remote-db-port}")
    private int remoteDbPort;

    @Value("${ssh.local-port}")
    private int localPort;

    @Value("${ssh.remote-redis-host:127.0.0.1}")
    private String remoteRedisHost;

    @Value("${ssh.remote-redis-port:6379}")
    private int remoteRedisPort;

    @Value("${ssh.local-redis-port:16379}")
    private int localRedisPort;

    @Value("${app.refresh-token.store:database}")
    private String refreshTokenStore;

    @Value("${ssh.strict-host-key-checking:no}")
    private String strictHostKeyChecking;

    @Value("${ssh.connect-timeout-ms:5000}")
    private int connectTimeoutMs;

    private Session session;

    public SshTunnelConfig(
            @Value("${ssh.host}") String sshHost,
            @Value("${ssh.port}") int sshPort,
            @Value("${ssh.username}") String sshUsername,
            @Value("${ssh.password}") String sshPassword,
            @Value("${ssh.remote-db-host}") String remoteDbHost,
            @Value("${ssh.remote-db-port}") int remoteDbPort,
            @Value("${ssh.local-port}") int localPort,
            @Value("${ssh.remote-redis-host:127.0.0.1}") String remoteRedisHost,
            @Value("${ssh.remote-redis-port:6379}") int remoteRedisPort,
            @Value("${ssh.local-redis-port:16379}") int localRedisPort,
            @Value("${app.refresh-token.store:database}") String refreshTokenStore,
            @Value("${ssh.strict-host-key-checking:no}") String strictHostKeyChecking,
            @Value("${ssh.connect-timeout-ms:5000}") int connectTimeoutMs
    ) throws Exception {
        this.strictHostKeyChecking = strictHostKeyChecking;
        this.connectTimeoutMs = connectTimeoutMs;
        this.remoteRedisHost = remoteRedisHost;
        this.remoteRedisPort = remoteRedisPort;
        this.localRedisPort = localRedisPort;
        this.refreshTokenStore = refreshTokenStore;

        boolean needsDbTunnel = !isLocalPortOpen(localPort);
        boolean redisStoreEnabled = "redis".equalsIgnoreCase(refreshTokenStore);
        boolean needsRedisTunnel = redisStoreEnabled && !isLocalPortOpen(localRedisPort);

        // devtools 재시작이나 중복 실행으로 이미 터널이 열려 있으면 기존 포트를 그대로 재사용합니다.
        if (!needsDbTunnel && !needsRedisTunnel) {
            log.info("ℹ️ 기존 SSH 터널 재사용: localhost:" + localPort);
            if (redisStoreEnabled) {
                log.info("ℹ️ 기존 Redis SSH 터널 재사용: localhost:" + localRedisPort);
            }
            return;
        }

        // 로컬 포트가 단순 점유 상태인지 먼저 확인해, 더 이해하기 쉬운 메시지로 실패 원인을 드러냅니다.
        if (needsDbTunnel && !isLocalPortBindable(localPort)) {
            throw new IllegalStateException("SSH 터널용 로컬 포트가 이미 다른 프로세스에서 사용 중입니다: " + localPort);
        }
        if (needsRedisTunnel && !isLocalPortBindable(localRedisPort)) {
            throw new IllegalStateException("Redis SSH 터널용 로컬 포트가 이미 다른 프로세스에서 사용 중입니다: " + localRedisPort);
        }

        JSch jsch = new JSch();
        session = jsch.getSession(sshUsername, sshHost, sshPort);
        session.setPassword(sshPassword);
        // StrictHostKeyChecking: 운영 환경에서는 "yes"로 설정하거나 known_hosts를 사용해야 합니다.
        // 개발 환경에서는 application.properties의 ssh.strict-host-key-checking 값으로 제어합니다.
        session.setConfig("StrictHostKeyChecking", strictHostKeyChecking);
        // SSH 서버 장애나 방화벽 문제를 빠르게 드러내기 위해 연결 대기 시간을 제한합니다.
        try {
            session.connect(connectTimeoutMs);
        } catch (JSchException e) {
            throw new IllegalStateException(
                    "SSH 서버 접속 실패: " + sshHost + ":" + sshPort
                            + " (.env의 SSH_HOST, SSH_PORT와 서버 방화벽/포트포워딩 상태를 확인하세요.)",
                    e
            );
        }

        if (needsDbTunnel) {
            session.setPortForwardingL(localPort, remoteDbHost, remoteDbPort);
            log.info("✅ SSH 터널 연결 완료: localhost:" + localPort + " → " + remoteDbHost + ":" + remoteDbPort);
        }

        if (needsRedisTunnel) {
            session.setPortForwardingL(localRedisPort, remoteRedisHost, remoteRedisPort);
            log.info("✅ Redis SSH 터널 연결 완료: localhost:" + localRedisPort + " → " + remoteRedisHost + ":" + remoteRedisPort);
        }
    }

    // localhost 포트에 이미 응답 중인 서비스가 있으면 기존 터널이 살아 있다고 보고 재사용합니다.
    private boolean isLocalPortOpen(int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", port), 500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    // 실제 바인드 가능 여부를 확인해서 점유 상태를 빠르게 감지합니다.
    private boolean isLocalPortBindable(int port) {
        try (ServerSocket serverSocket = new ServerSocket()) {
            serverSocket.bind(new InetSocketAddress("127.0.0.1", port));
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    @PreDestroy
    public void closeTunnel() {
        if (session != null && session.isConnected()) {
            session.disconnect();
            log.info("🔌 SSH 터널 종료");
        }
    }
}
