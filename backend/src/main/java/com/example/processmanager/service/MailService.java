package com.example.processmanager.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);
    private static final URI GOOGLE_TOKEN_URI = URI.create("https://oauth2.googleapis.com/token");
    private static final URI GMAIL_SEND_URI = URI.create("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final boolean enabled;
    private final String clientId;
    private final String clientSecret;
    private final String refreshToken;
    private final String from;

    public MailService(
            ObjectMapper objectMapper,
            @Value("${app.mail.enabled:true}") boolean enabled,
            @Value("${google.mail.client-id:}") String clientId,
            @Value("${google.mail.client-secret:}") String clientSecret,
            @Value("${google.mail.refresh-token:}") String refreshToken,
            @Value("${google.mail.from:}") String from
    ) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.enabled = enabled;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
        this.from = from;
    }

    public void sendText(String to, String subject, String body) {
        if (!isConfigured()) {
            log.info("mail skipped: Gmail API OAuth is not configured");
            return;
        }

        try {
            String accessToken = requestAccessToken();
            String rawMessage = createRawMessage(to, subject, body);
            String requestBody = objectMapper.writeValueAsString(Map.of("raw", rawMessage));

            HttpRequest request = HttpRequest.newBuilder(GMAIL_SEND_URI)
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("mail send failed: to={}, status={}", to, response.statusCode());
            }
        } catch (Exception e) {
            log.warn("mail send failed: to={}, subject={}, error={}", to, subject, e.getMessage());
        }
    }

    private String requestAccessToken() throws Exception {
        String form = formField("client_id", clientId)
                + "&" + formField("client_secret", clientSecret)
                + "&" + formField("refresh_token", refreshToken)
                + "&" + formField("grant_type", "refresh_token");

        HttpRequest request = HttpRequest.newBuilder(GOOGLE_TOKEN_URI)
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Google token request failed with status " + response.statusCode());
        }

        JsonNode tokenResponse = objectMapper.readTree(response.body());
        String accessToken = tokenResponse.path("access_token").asText("");
        if (accessToken.isBlank()) {
            throw new IllegalStateException("Google token response did not include access_token");
        }
        return accessToken;
    }

    private String createRawMessage(String to, String subject, String body) {
        String safeFrom = requireSafeAddress(from);
        String safeTo = requireSafeAddress(to);
        String encodedSubject = encodeHeader(subject);
        String encodedBody = Base64.getMimeEncoder(76, "\r\n".getBytes(StandardCharsets.US_ASCII))
                .encodeToString(body.getBytes(StandardCharsets.UTF_8));

        String message = """
                From: %s
                To: %s
                Subject: %s
                MIME-Version: 1.0
                Content-Type: text/plain; charset=UTF-8
                Content-Transfer-Encoding: base64

                %s
                """.formatted(safeFrom, safeTo, encodedSubject, encodedBody).replace("\n", "\r\n");

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(message.getBytes(StandardCharsets.UTF_8));
    }

    private String formField(String name, String value) {
        return URLEncoder.encode(name, StandardCharsets.UTF_8)
                + "="
                + URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String encodeHeader(String value) {
        String encoded = Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
        return "=?UTF-8?B?" + encoded + "?=";
    }

    private String requireSafeAddress(String address) {
        if (address == null || address.isBlank() || address.contains("\r") || address.contains("\n")) {
            throw new IllegalArgumentException("Invalid email address");
        }
        return address;
    }

    private boolean isConfigured() {
        return enabled
                && clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank()
                && refreshToken != null && !refreshToken.isBlank()
                && from != null && !from.isBlank();
    }
}
