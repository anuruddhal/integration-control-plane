# ICP Playwright Java E2E tests

This suite is wired into the ICP Gradle build and defaults to a self-contained product fixture.

Default flow:

1. build/package the ICP distribution,
2. resolve the latest released MI zip from Maven (`-PmiVersion=` overrides it),
3. build the BI test app from `src/test/resources/bi/hello-world` using released `wso2/icp.runtime.bridge:0.1.9`,
4. unzip and start ICP from the packaged distribution with fresh H2 databases,
5. run Playwright Java tests against that product instance.

Run from `./icp`:

```bash
./gradlew :e2e-tests:test
./gradlew check
```

Useful properties:

```bash
./gradlew :e2e-tests:test \
  -PmiVersion=4.6.0 \
  -Dicp.e2e.headless=false \
  -Dicp.e2e.timeoutMs=30000
```

To run against an already running ICP instead of the self-contained fixture:

```bash
./gradlew :e2e-tests:test \
  -Dicp.e2e.selfContained=false \
  -Dicp.e2e.baseUrl=https://localhost:9445
```

The non-observability tests cover login, failed login, protected-route redirect, logout, public policy pages, project listing, environment listing, project validation, and not-found resources.

## Observability (runtime logs)

The runtime log scenario starts real BI and MI runtimes plus an OpenSearch +
Fluent Bit pipeline and verifies their emitted logs in the ICP UI. It needs
Docker and is enabled with `-Dicp.e2e.observability=true` (the default when
running `check`).

OpenSearch and Fluent Bit are managed by Testcontainers (auto cleanup via Ryuk);
BI, MI and ICP run as host processes.

On Linux/CI with the default Docker socket nothing extra is needed. With
**Colima** locally, point Testcontainers at its socket:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/var/run/docker.sock"
./gradlew :e2e-tests:test --tests '*RuntimeLogsScenariosTest' -Dicp.e2e.observability=true
```

OpenSearch needs `vm.max_map_count >= 262144` on the Docker host.
