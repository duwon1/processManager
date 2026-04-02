package com.example.processmanager;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("com.example.processmanager.mapper")
public class ProcessManagerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ProcessManagerApplication.class, args);
    }

}
