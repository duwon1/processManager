package com.example.processmanager.service;

import com.example.processmanager.entity.RefreshToken;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "app.refresh-token.store", havingValue = "redis")
public class RedisRefreshTokenStore implements RefreshTokenStore {

    private static final String KEY_PREFIX = "refresh-token:";
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final StringRedisTemplate redisTemplate;

    public RedisRefreshTokenStore(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    public void upsert(RefreshToken refreshToken) {
        String key = key(refreshToken.getUserEmail());
        Map<Object, Object> previous = redisTemplate.opsForHash().entries(key);
        LocalDateTime now = LocalDateTime.now();

        Map<String, String> values = new HashMap<>();
        values.put("userEmail", refreshToken.getUserEmail());
        values.put("tokenHash", refreshToken.getTokenHash());
        values.put("salt", refreshToken.getSalt());
        values.put("expiresAt", format(refreshToken.getExpiresAt()));
        values.put("createdAt", valueOrNow(previous.get("createdAt"), now));

        Object previousHash = previous.get("tokenHash");
        Object previousSalt = previous.get("salt");
        if (previousHash != null && previousSalt != null) {
            values.put("prevTokenHash", previousHash.toString());
            values.put("prevSalt", previousSalt.toString());
            values.put("replacedAt", format(now));
        }

        redisTemplate.opsForHash().putAll(key, values);
        Duration ttl = Duration.between(now, refreshToken.getExpiresAt());
        if (ttl.isPositive()) {
            redisTemplate.expire(key, ttl);
        } else {
            redisTemplate.delete(key);
        }
    }

    @Override
    public RefreshToken findByUserEmail(String userEmail) {
        Map<Object, Object> values = redisTemplate.opsForHash().entries(key(userEmail));
        if (values.isEmpty()) {
            return null;
        }

        return RefreshToken.builder()
                .userEmail(stringValue(values.get("userEmail")))
                .tokenHash(stringValue(values.get("tokenHash")))
                .salt(stringValue(values.get("salt")))
                .prevTokenHash(stringValue(values.get("prevTokenHash")))
                .prevSalt(stringValue(values.get("prevSalt")))
                .replacedAt(dateValue(values.get("replacedAt")))
                .expiresAt(dateValue(values.get("expiresAt")))
                .createdAt(dateValue(values.get("createdAt")))
                .build();
    }

    @Override
    public void deleteByUserEmail(String userEmail) {
        redisTemplate.delete(key(userEmail));
    }

    private String key(String userEmail) {
        return KEY_PREFIX + userEmail;
    }

    private String stringValue(Object value) {
        return value == null ? null : value.toString();
    }

    private LocalDateTime dateValue(Object value) {
        return value == null ? null : LocalDateTime.parse(value.toString(), DATE_FORMAT);
    }

    private String format(LocalDateTime value) {
        return value.format(DATE_FORMAT);
    }

    private String valueOrNow(Object value, LocalDateTime now) {
        return value == null ? format(now) : value.toString();
    }
}
