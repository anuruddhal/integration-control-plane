# Disabling SSL in ICP

By default all three listeners (9446, 9445, 9449) start with TLS enabled.
Set `sslEnabled = false` to switch them to plain HTTP.

## Option 1 — Environment variable (Kubernetes / Docker)

```
BAL_CONFIG_VAR_SSLENABLED=false
```

Kubernetes:
```yaml
env:
  - name: BAL_CONFIG_VAR_SSLENABLED
    value: "false"
```

Docker:
```
docker run -e BAL_CONFIG_VAR_SSLENABLED=false anuruddhal/wso2-integration-control-plane:2.0.0
```

## Option 2 — deployment.toml

Add to the top-level section (before any `[section]` header):

```toml
sslEnabled = false
```

## What changes

- All three ports serve plain HTTP instead of HTTPS
- Frontend `config.json` URLs switch from `https://` to `http://`
- Startup log prints `http://localhost:9446`

## Re-enabling

Remove the env var or delete the `sslEnabled` line. SSL is on by default.
