package org.wso2.icp.e2e;

import org.junit.jupiter.api.BeforeAll;

public abstract class BaseObservabilityE2ETest extends BaseE2ETest {
    @BeforeAll
    protected static void startObservabilityBrowser() {
        startBrowser(E2EConfig.load().forObservabilitySuite());
    }
}
