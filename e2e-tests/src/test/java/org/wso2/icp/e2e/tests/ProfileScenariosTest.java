package org.wso2.icp.e2e.tests;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.wso2.icp.e2e.BaseCoreE2ETest;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Tag("e2e")
@DisplayName("Profile scenarios")
class ProfileScenariosTest extends BaseCoreE2ETest {

    @Test
    @DisplayName("Profile details")
    void profileDetails() {
        signInAsAdmin();

        page.navigate(config.url("/profile"));

        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Profile"))).isVisible();
        assertThat(page.getByText("@" + config.adminUsername())).isVisible();
        assertThat(page.getByText("Groups")).isVisible();
    }
}
