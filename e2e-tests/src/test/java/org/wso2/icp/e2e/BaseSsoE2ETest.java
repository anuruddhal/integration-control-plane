package org.wso2.icp.e2e;

import org.junit.jupiter.api.BeforeAll;

public abstract class BaseSsoE2ETest extends BaseE2ETest {
    @BeforeAll
    protected static void startSsoBrowser() {
        startBrowser(E2EConfig.load().forSsoSuite());
    }
}
