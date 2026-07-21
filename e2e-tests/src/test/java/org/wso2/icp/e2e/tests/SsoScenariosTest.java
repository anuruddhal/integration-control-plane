package org.wso2.icp.e2e.tests;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.wso2.icp.e2e.BaseSsoE2ETest;
import org.wso2.icp.e2e.E2EEnvironment;
import org.wso2.icp.e2e.pages.AppPage;
import org.wso2.icp.e2e.pages.LoginPage;

import java.util.regex.Pattern;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Tag("e2e")
@Tag("sso")
@DisplayName("SSO scenarios")
class SsoScenariosTest extends BaseSsoE2ETest {

    @Test
    @DisplayName("ThunderID SSO login succeeds")
    void thunderIdSsoLoginSucceeds() {
        new LoginPage(page).open(config.baseUrl());
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Sign in with SSO")).click();
        assertThat(page).hasURL(Pattern.compile("https://localhost:\\d+/gate/signin.*"));

        page.getByPlaceholder("Enter your username").fill(E2EEnvironment.SSO_USERNAME);
        page.getByPlaceholder("Enter your password").fill(E2EEnvironment.SSO_PASSWORD);
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Sign In")).click();

        assertThat(page).hasURL(Pattern.compile(".*/organizations/default$"));
        new AppPage(page).assertProjectsVisible();
    }
}
