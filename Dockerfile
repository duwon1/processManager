# Stage 1 — 프론트엔드 빌드
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2 — Spring Boot JAR 빌드 (프론트 빌드 결과물 포함)
FROM gradle:8-jdk21-alpine AS backend
WORKDIR /app
# 의존성 캐시 레이어: 빌드 스크립트만 먼저 복사해 소스 변경 시에도 의존성 다운로드를 재사용합니다.
COPY backend/build.gradle backend/settings.gradle ./
RUN gradle dependencies --no-daemon -q > /dev/null
COPY backend/ ./
RUN rm -rf ./src/main/resources/static/assets ./src/main/resources/static/index.html ./src/main/resources/static/favicon.svg ./src/main/resources/static/icons.svg
COPY --from=frontend /app/frontend/dist ./src/main/resources/static/
# 테스트는 H2 인메모리 DB(src/test/resources/application.properties)로 동작하므로 외부 MySQL/Redis 없이 실행됩니다.
# 테스트가 실패하면 이미지가 만들어지지 않습니다. (plain jar가 생기지 않도록 build 대신 test + bootJar 사용)
RUN gradle test bootJar --no-daemon -q

# Stage 3 — 실행 (JRE만 포함한 경량 이미지)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S processmanager && adduser -S processmanager -G processmanager
COPY --from=backend /app/build/libs/*.jar app.jar
RUN chown -R processmanager:processmanager /app
EXPOSE 8080
USER processmanager
# 컨테이너 메모리 한도에 맞춰 힙을 잡도록 고정 -Xmx 대신 비율을 사용합니다.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "app.jar", "--spring.profiles.active=prod"]
