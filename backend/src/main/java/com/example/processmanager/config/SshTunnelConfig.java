package com.example.processmanager.config;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    @Value("${ssh.strict-host-key-checking:no}")
    private String strictHostKeyChecking;

    private Session session;

    public SshTunnelConfig(
            @Value("${ssh.host}") String sshHost,
            @Value("${ssh.port}") int sshPort,
            @Value("${ssh.username}") String sshUsername,
            @Value("${ssh.password}") String sshPassword,
            @Value("${ssh.remote-db-host}") String remoteDbHost,
            @Value("${ssh.remote-db-port}") int remoteDbPort,
            @Value("${ssh.local-port}") int localPort,
            @Value("${ssh.strict-host-key-checking:no}") String strictHostKeyChecking
    ) throws Exception {
        this.strictHostKeyChecking = strictHostKeyChecking;
        // devtools 재시작이나 중복 실행으로 이미 터널이 열려 있으면 기존 포트를 그대로 재사용합니다.
        if (isLocalPortOpen(localPort)) {
            log.info("ℹ️ 기존 SSH 터널 재사용: localhost:" + localPort);
            return;
        }

        // 로컬 포트가 단순 점유 상태인지 먼저 확인해, 더 이해하기 쉬운 메시지로 실패 원인을 드러냅니다.
        if (!isLocalPortBindable(localPort)) {
            throw new IllegalStateException("SSH 터널용 로컬 포트가 이미 다른 프로세스에서 사용 중입니다: " + localPort);
        }

        JSch jsch = new JSch();
        session = jsch.getSession(sshUsername, sshHost, sshPort);
        session.setPassword(sshPassword);
        // StrictHostKeyChecking: 운영 환경에서는 "yes"로 설정하거나 known_hosts를 사용해야 합니다.
        // 개발 환경에서는 application.properties의 ssh.strict-host-key-checking 값으로 제어합니다.
        session.setConfig("StrictHostKeyChecking", strictHostKeyChecking);
        session.connect();

        session.setPortForwardingL(localPort, remoteDbHost, remoteDbPort);

        log.info("✅ SSH 터널 연결 완료: localhost:" + localPort + " → " + remoteDbHost + ":" + remoteDbPort);
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
