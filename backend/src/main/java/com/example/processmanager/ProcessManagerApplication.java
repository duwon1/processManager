package com.example.processmanager;

import io.github.cdimascio.dotenv.Dotenv;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@SpringBootApplication
@MapperScan("com.example.processmanager.mapper")
public class ProcessManagerApplication {

    public static void main(String[] args) {
        // backend/.env 파일을 기준으로 .env 위치를 탐색합니다.
        // - 현재 워킹 디렉토리가 backend/ 인 경우: 그대로 사용
        // - 현재 워킹 디렉토리가 프로젝트 루트인 경우: backend/ 하위를 사용
        // - 없으면 무시하고 OS 환경변수를 사용합니다. (운영 서버 대응)
        Path workDir = Paths.get("").toAbsolutePath();
        Path envDir = workDir;

        if (Files.exists(workDir.resolve("backend/.env"))) {
            envDir = workDir.resolve("backend");
        }

        Dotenv.configure()
                .directory(envDir.toString())
                .ignoreIfMissing()
                .load()
                .entries()
                .forEach(e -> System.setProperty(e.getKey(), e.getValue()));

        SpringApplication.run(ProcessManagerApplication.class, args);
    }

}
