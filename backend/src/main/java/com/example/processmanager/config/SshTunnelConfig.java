package com.example.processmanager.config;

import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SshTunnelConfig {

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

    private Session session;

    public SshTunnelConfig(
            @Value("${ssh.host}") String sshHost,
            @Value("${ssh.port}") int sshPort,
            @Value("${ssh.username}") String sshUsername,
            @Value("${ssh.password}") String sshPassword,
            @Value("${ssh.remote-db-host}") String remoteDbHost,
            @Value("${ssh.remote-db-port}") int remoteDbPort,
            @Value("${ssh.local-port}") int localPort
    ) throws Exception {
        JSch jsch = new JSch();
        session = jsch.getSession(sshUsername, sshHost, sshPort);
        session.setPassword(sshPassword);
        session.setConfig("StrictHostKeyChecking", "no");
        session.connect();

        session.setPortForwardingL(localPort, remoteDbHost, remoteDbPort);

        System.out.println("✅ SSH 터널 연결 완료: localhost:" + localPort + " → " + remoteDbHost + ":" + remoteDbPort);
    }

    @PreDestroy
    public void closeTunnel() {
        if (session != null && session.isConnected()) {
            session.disconnect();
            System.out.println("🔌 SSH 터널 종료");
        }
    }
}
