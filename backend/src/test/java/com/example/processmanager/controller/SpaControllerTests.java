package com.example.processmanager.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class SpaControllerTests {

    @Test
    void oauth2LoginPageRedirectsToFrontendLogin() {
        SpaController controller = new SpaController("http://localhost:5173/");

        String viewName = controller.oauth2LoginPage();

        assertThat(viewName).isEqualTo("redirect:http://localhost:5173/login");
    }

    @Test
    void spaFallbackIncludesSettingsRoutes() throws NoSuchMethodException {
        Method method = SpaController.class.getDeclaredMethod("spa");
        GetMapping mapping = method.getAnnotation(GetMapping.class);

        assertThat(mapping.value()).contains(
                "/settings",
                "/settings/**",
                "/notification-rules"
        );
    }
}
