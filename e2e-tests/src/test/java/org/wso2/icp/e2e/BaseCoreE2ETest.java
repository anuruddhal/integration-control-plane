package org.wso2.icp.e2e;

import org.junit.jupiter.api.BeforeAll;

public abstract class BaseCoreE2ETest extends BaseE2ETest {
    @BeforeAll
    protected static void startCoreBrowser() {
        startBrowser(E2EConfig.load().forCoreSuite());
    }
}
