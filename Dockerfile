# Stage 1 — 프론트엔드 빌드
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2 — Spring Boot JAR 빌드 (프론트 빌드 결과물 포함)
FROM gradle:8-jdk21-alpine AS backend
WORKDIR /app
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./src/main/resources/static/
RUN gradle bootJar --no-daemon -q

# Stage 3 — 실행 (JRE만 포함한 경량 이미지)
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend /app/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx400m", "-Xms200m", "-jar", "app.jar", "--spring.profiles.active=prod"]
