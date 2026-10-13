# Runtime Configuration

## Overview

This application supports runtime configuration, allowing you to modify backend API URLs **after building** without needing to rebuild the application.

## How It Works

1. **Build time**: Hardcoded fallback defaults are included in the build
2. **Runtime**: The app loads `/config.json` on startup with the actual configuration
3. **Priority**: Runtime config (`config.json`) overrides hardcoded defaults, key by key — a key missing from `config.json` keeps its default

## Files

- `public/config.json` - Runtime configuration (copied to `dist/config.json` on build)
- `src/config/runtimeConfig.ts` - Every supported key, how it maps onto `window.API_CONFIG`, and the fallback defaults

## Configuration Format

```json
{
  "CHOREO_BASE_API_URL": "https://<api-gateway-host>/<console-api-path>",
  "VITE_AUTH_BASE_URL": "https://<identity-provider-host>",
  "VITE_OBSERVABILITY_URL": "https://<observability-host>"
}
```

## Usage

### Local Development

Edit `public/config.json` with your backend URLs, then restart the dev server.

### Production Deployment

#### Option 1: Modify config.json After Build

```bash
# Build the app
pnpm build

# Edit the config in dist/
nano dist/config.json

# Deploy dist/ folder
```

#### Option 2: Docker with Environment Variables

Create a `docker-entrypoint.sh`:

```bash
#!/bin/sh
# Generate config.json from environment variables
cat > /usr/share/nginx/html/config.json <<EOF
{
  "CHOREO_BASE_API_URL": "${API_BASE_URL}",
  "VITE_AUTH_BASE_URL": "${AUTH_BASE_URL}",
  "VITE_OBSERVABILITY_URL": "${OBSERVABILITY_URL}"
}
EOF

# Start nginx
nginx -g 'daemon off;'
```

Dockerfile:

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
```

Run with:

```bash
docker run -e API_BASE_URL=https://api.example.com/console-api \
           -e AUTH_BASE_URL=https://auth.example.com \
           -e OBSERVABILITY_URL=https://obs.example.com \
           my-app
```

#### Option 3: Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  config.json: |
    {
      "CHOREO_BASE_API_URL": "https://api.example.com/console-api",
      "VITE_AUTH_BASE_URL": "https://auth.example.com",
      "VITE_OBSERVABILITY_URL": "https://obs.example.com"
    }
---
apiVersion: v1
kind: Pod
metadata:
  name: frontend
spec:
  containers:
    - name: nginx
      image: my-frontend:latest
      volumeMounts:
        - name: config
          mountPath: /usr/share/nginx/html/config.json
          subPath: config.json
  volumes:
    - name: config
      configMap:
        name: app-config
```

## Cloud sign-in (Thunder SDK)

The `cloud` build signs in with the Thunder SDK (`@thunderid/react`). Until it gets keys of its own it reads the existing ones:

| Key                             | Used as                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `VITE_AUTH_BASE_URL`            | Thunder base URL; the SDK reads `<base>/.well-known/openid-configuration` |
| `ASGARDEO_CLIENT_ID`            | OAuth client ID (`IPAAS_CONSOLE`)                                         |
| `ASGARDEO_SCOPE`                | Requested scopes                                                          |
| `ASGARDEO_RESOURCE`             | `resource` on the authorize request only — never on the token request     |
| `ASGARDEO_SIGN_IN_REDIRECT_URL` | Redirect URI (`https://<console-host>/signin`)                            |

Sign-out returns to the page origin, the only post-logout URI the client registers. `ASGARDEO_AUTHORIZE_ENDPOINT`, `ASGARDEO_TOKEN_ENDPOINT` and the `STS_*` keys are not read by the cloud build — the SDK takes its endpoints from discovery.

## Verification

Open browser console after app loads - you should see:

```
✓ Runtime configuration loaded from config.json
```

## Fallback Behavior

If `config.json` fails to load:

- Falls back to the hardcoded defaults (`DEFAULT_CONFIG` in `src/config/runtimeConfig.ts`)
- Shows warning in console: `"Failed to load runtime config, using defaults"`
- The defaults are placeholders, not a working environment, so every deployment must ship its own `config.json`

## Benefits

✅ **One build, multiple environments** - Build once, deploy everywhere  
✅ **No rebuild required** - Change URLs instantly  
✅ **DevOps friendly** - Easy to configure via ConfigMaps, env vars, or direct file modification  
✅ **Safe fallbacks** - The app still boots without config.json, with a console warning
