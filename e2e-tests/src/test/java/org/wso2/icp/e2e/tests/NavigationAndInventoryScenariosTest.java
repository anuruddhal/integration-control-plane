package org.wso2.icp.e2e.tests;

import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.AriaRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.wso2.icp.e2e.BaseCoreE2ETest;
import org.wso2.icp.e2e.pages.AppPage;

import java.util.regex.Pattern;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;

@Tag("e2e")
@DisplayName("Navigation and inventory scenarios")
class NavigationAndInventoryScenariosTest extends BaseCoreE2ETest {

    @Test
    @DisplayName("Main organization navigation works")
    void organizationNavigationWorks() {
        signInAsAdmin();

        clickSidebar("Runtimes");
        assertThat(page).hasURL(Pattern.compile(".*/organizations/default/runtimes$"));
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName(Pattern.compile(".*Runtimes.*")))).isVisible();

        clickSidebar("Environments");
        assertThat(page).hasURL(Pattern.compile(".*/organizations/default/environments$"));
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Environments"))).isVisible();

        clickSidebar("Overview");
        assertThat(page).hasURL(Pattern.compile(".*/organizations/default$"));
        new AppPage(page).assertProjectsVisible();
    }

    // Sidebar nav items are buttons (aria-labelled) inside the <aside>; they navigate on click
    // even though the sidebar is collapsed by default.
    private void clickSidebar(String item) {
        page.locator("aside")
                .getByRole(AriaRole.BUTTON, new Locator.GetByRoleOptions().setName(item).setExact(true))
                .click();
    }

    @Test
    @DisplayName("List environments")
    void listEnvironments() {
        signInAsAdmin();
        page.navigate(config.url("/organizations/default/environments"));

        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Environments"))).isVisible();
        assertThat(page.getByLabel("Search...")).isVisible();
        assertThat(page.getByText("Name", new Page.GetByTextOptions().setExact(true)).first()).isVisible();
        assertThat(page.getByText("Handler", new Page.GetByTextOptions().setExact(true)).first()).isVisible();
        assertThat(page.getByText("Type", new Page.GetByTextOptions().setExact(true)).first()).isVisible();

        page.getByLabel("Search...").fill("__missing_environment__");
        assertThat(page.getByText("No records to display")).isVisible();
    }
}
