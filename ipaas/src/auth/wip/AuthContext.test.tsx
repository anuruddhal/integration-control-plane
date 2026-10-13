/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from '../contract';
import { AuthProvider, useAuth } from './AuthContext';
import { getAccessToken, getRefreshToken } from './tokenManager';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDP_TOKEN = 'https://idp.example/oauth2/token';
const STS_TOKEN = 'https://sts.example/oauth2/token';
const ORGS_API = 'https://api.example/orgs/1.0.0';
const VALIDATE_USER = 'https://api.example/user-mgt/1.0.0/validate/user?origin_cloud=devant';
const AUTH_BASE = 'https://auth.example';

const b64 = (value: unknown): string => btoa(JSON.stringify(value)).replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>): string => `h.${b64(claims)}.s`;
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (init: RequestInit) => Response;
let routes: Record<string, Handler>;
let calls: Array<{ url: string; init: RequestInit }>;
let root: Root;
let auth: AuthContextValue;

function Probe() {
  auth = useAuth();
  return null;
}

// What loginWithOIDC leaves behind before it leaves for the IdP.
function seedSignInStarted(state = 'saved-state'): void {
  localStorage.setItem('oidc_state', state);
  sessionStorage.setItem('pkce_verifier', 'verifier-1');
}

const params = (values: Record<string, string>): URLSearchParams => new URLSearchParams(values);
const callsTo = (url: string) => calls.filter((c) => c.url === url);

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  calls = [];
  routes = {
    [IDP_TOKEN]: () => json({ access_token: 'idp-token', refresh_token: 'rt-1', expires_in: 1800, id_token: jwt({ sub: 'user-1', preferred_username: 'ada', name: 'Ada Lovelace' }) }),
    [VALIDATE_USER]: () => json({ organizations: [{ id: '42', handle: 'acme' }] }),
    [STS_TOKEN]: () => json({ access_token: 'sts-token', expires_in: 900 }),
  };
  window.API_CONFIG = {
    asgardeoClientId: 'idp-client',
    asgardeoTokenEndpoint: IDP_TOKEN,
    asgardeoSignInRedirectUrl: 'https://console.example/signin',
    stsTokenEndpoint: STS_TOKEN,
    stsClientId: 'sts-client',
    stsScope: 'sts-scope',
    choreoOrgApiUrl: ORGS_API,
    authBaseUrl: AUTH_BASE,
  } as unknown as typeof window.API_CONFIG;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      calls.push({ url: input, init });
      const handler = routes[input];
      if (!handler) throw new Error(`Unexpected fetch: ${input}`);
      return handler(init);
    }),
  );

  root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider>
            <Probe />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('WIP completeSignIn — checking what came back', () => {
  it('reports an error the IdP returned', async () => {
    await expect(auth.completeSignIn(params({ error: 'access_denied', error_description: 'User cancelled' }))).rejects.toThrow('Authentication failed: User cancelled');
    expect(calls).toHaveLength(0);
  });

  it('refuses a callback with no state', async () => {
    await expect(auth.completeSignIn(params({ code: 'c' }))).rejects.toThrow('Missing state parameter. Please try logging in again.');
  });

  it('refuses a state this browser did not start, and spends the saved one', async () => {
    seedSignInStarted();
    await expect(auth.completeSignIn(params({ code: 'c', state: 'forged' }))).rejects.toThrow(/Invalid state parameter/);
    expect(localStorage.getItem('oidc_state')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('refuses a callback with no code', async () => {
    seedSignInStarted();
    await expect(auth.completeSignIn(params({ state: 'saved-state' }))).rejects.toThrow('Missing authorization code. Please try logging in again.');
  });

  it('refuses when the PKCE verifier is gone', async () => {
    localStorage.setItem('oidc_state', 'saved-state');
    await expect(auth.completeSignIn(params({ code: 'c', state: 'saved-state' }))).rejects.toThrow(/Missing PKCE code verifier/);
  });
});

describe('WIP completeSignIn — exchanging the code', () => {
  it('signs an existing user in with an org-scoped STS token', async () => {
    seedSignInStarted();
    let result: { isNewUser: boolean; userId: string } | undefined;
    await act(async () => {
      result = await auth.completeSignIn(params({ code: 'code-1', state: 'saved-state' }));
    });

    expect(result).toEqual({ isNewUser: false, userId: 'user-1' });
    const exchange = new URLSearchParams(callsTo(IDP_TOKEN)[0].init.body as string);
    expect(Object.fromEntries(exchange)).toEqual({ grant_type: 'authorization_code', code: 'code-1', redirect_uri: 'https://console.example/signin', client_id: 'idp-client', code_verifier: 'verifier-1' });
    expect(new Headers(callsTo(VALIDATE_USER)[0].init.headers).get('Authorization')).toBe('Bearer idp-token');
    const sts = callsTo(STS_TOKEN).map((c) => new URLSearchParams(c.init.body as string));
    expect(sts.at(-1)?.get('orgHandle')).toBe('acme');

    expect(getAccessToken()).toBe('sts-token');
    expect(getRefreshToken()).toBe('rt-1');
    expect(localStorage.getItem('org_handle')).toBe('acme');
    expect(localStorage.getItem('org_numeric_id')).toBe('42');
    expect(auth).toMatchObject({ isAuthenticated: true, userId: 'user-1', username: 'ada', displayName: 'Ada Lovelace', isOidcUser: true });
  });

  it('sends a user with no org yet to registration', async () => {
    seedSignInStarted();
    routes[VALIDATE_USER] = () => json({ organizations: [], isNewUserSignup: true });
    let result: { isNewUser: boolean; userId: string } | undefined;
    await act(async () => {
      result = await auth.completeSignIn(params({ code: 'code-1', state: 'saved-state' }));
    });
    expect(result).toEqual({ isNewUser: true, userId: 'user-1' });
    expect(auth.isAuthenticated).toBe(true);
  });

  it('reports a failed code exchange', async () => {
    seedSignInStarted();
    routes[IDP_TOKEN] = () => new Response('invalid_grant', { status: 400 });
    await expect(auth.completeSignIn(params({ code: 'code-1', state: 'saved-state' }))).rejects.toThrow('Token exchange failed (400): invalid_grant');
    expect(auth.isAuthenticated).toBe(false);
  });

  // The cloud-only branch read ouHandle from the IdP token; WIP never does.
  it('takes the org from validate/user, not from claims in the IdP token', async () => {
    seedSignInStarted();
    routes[IDP_TOKEN] = () => json({ access_token: jwt({ ouHandle: 'token-org' }), refresh_token: 'rt-1', id_token: jwt({ sub: 'user-1' }) });
    await act(async () => {
      await auth.completeSignIn(params({ code: 'code-1', state: 'saved-state' }));
    });
    expect(localStorage.getItem('org_handle')).toBe('acme');
  });
});

describe('WIP local login (ICP)', () => {
  it('signs in with a username and password', async () => {
    routes[`${AUTH_BASE}/login`] = () =>
      json({ userId: 'u-local', token: 'local-token', expiresIn: 600, refreshToken: 'local-rt', refreshTokenExpiresIn: 86400, username: 'admin', displayName: 'Admin', permissions: [], isOidcUser: false, requirePasswordChange: true });
    await act(async () => {
      await auth.login('admin', 'secret');
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: 'admin', password: 'secret' });
    expect(getAccessToken()).toBe('local-token');
    expect(auth).toMatchObject({ isAuthenticated: true, userId: 'u-local', isOidcUser: false, requirePasswordChange: true });
  });

  it('carries the retry delay of a rate-limited login', async () => {
    routes[`${AUTH_BASE}/login`] = () => new Response(JSON.stringify({ retryAfterSeconds: 30 }), { status: 429 });
    await expect(auth.login('admin', 'wrong')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 30 });
  });

  it('logs out by revoking the local session and clearing it', async () => {
    routes[`${AUTH_BASE}/login`] = () => json({ userId: 'u-local', token: 'local-token', expiresIn: 600, refreshToken: 'local-rt', refreshTokenExpiresIn: 86400, username: 'admin', displayName: 'Admin', permissions: [], isOidcUser: false });
    routes[`${AUTH_BASE}/revoke-token`] = () => new Response('');
    await act(async () => {
      await auth.login('admin', 'secret');
    });
    await act(async () => {
      await auth.logout();
    });
    expect(callsTo(`${AUTH_BASE}/revoke-token`)).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
  });
});
