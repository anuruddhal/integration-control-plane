package org.wso2.icp.e2e.tests;

import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.wso2.icp.e2e.BaseCoreE2ETest;
import org.wso2.icp.e2e.pages.AppPage;
import org.wso2.icp.e2e.pages.LoginPage;

import java.util.regex.Pattern;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Tag("e2e")
@DisplayName("Access control scenarios")
class AccessControlScenariosTest extends BaseCoreE2ETest {

    @Test
    @DisplayName("Org access tabs")
    void orgAccessTabs() {
        signInAsAdmin();
        page.navigate(config.url("/organizations/default/settings/access-control/users"));

        assertAccessControlPage();
        assertThat(page.getByText("Username", new Page.GetByTextOptions().setExact(true))).isVisible();
        assertThat(page.getByText(config.adminUsername(), new Page.GetByTextOptions().setExact(true)).first()).isVisible();
        assertSearchEmptyState("__missing_user__");

        page.getByRole(AriaRole.TAB, new Page.GetByRoleOptions().setName("Roles")).click();
        assertThat(page).hasURL(Pattern.compile(".*/settings/access-control/roles$"));
        assertThat(page.getByText("Role Name", new Page.GetByTextOptions().setExact(true))).isVisible();
        assertSearchEmptyState("__missing_role__");

        page.getByRole(AriaRole.TAB, new Page.GetByRoleOptions().setName("Groups")).click();
        assertThat(page).hasURL(Pattern.compile(".*/settings/access-control/groups$"));
        assertThat(page.getByText("Users", new Page.GetByTextOptions().setExact(true))).isVisible();
        assertThat(page.getByText("Roles", new Page.GetByTextOptions().setExact(true))).isVisible();
        assertSearchEmptyState("__missing_group__");
    }

    private void assertAccessControlPage() {
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Access Control"))).isVisible();
        assertThat(page.getByRole(AriaRole.TAB, new Page.GetByRoleOptions().setName("Users"))).isVisible();
        assertThat(page.getByRole(AriaRole.TAB, new Page.GetByRoleOptions().setName("Roles"))).isVisible();
        assertThat(page.getByRole(AriaRole.TAB, new Page.GetByRoleOptions().setName("Groups"))).isVisible();
    }

    private void assertSearchEmptyState(String query) {
        page.getByLabel("Search...").fill(query);
        assertThat(page.getByText("No records to display")).isVisible();
        page.getByLabel("Search...").clear();
    }

    private void signInAsAdmin() {
        LoginPage login = new LoginPage(page);
        login.open(config.baseUrl());
        login.signIn(config.adminUsername(), config.adminPassword());
        new AppPage(page).assertProjectsVisible();
    }
}
