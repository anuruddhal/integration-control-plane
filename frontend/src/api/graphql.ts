import { authenticatedFetch } from '../auth/tokenManager';

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Authentication failed (${status})`);
    this.status = status;
  }
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await authenticatedFetch(window.API_CONFIG.graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) {
    throw new AuthError(401);
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}
