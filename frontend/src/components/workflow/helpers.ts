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

// Pure helpers for the workflow feature. Kept separate from the component module
// (shared.tsx) so React Fast Refresh works and concerns stay separated.

/** Pretty-prints any value as JSON for display; returns '' for nullish. */
export function jsonPretty(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Formats an ISO-8601 timestamp for compact display; passes through on failure. */
export function formatTime(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

/** Decodes a base64 string to UTF-8 text (handles multi-byte characters). */
function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Extracts the start input from a workflow history's WORKFLOW_EXECUTION_STARTED event.
 * Temporal carries inputs as payloads with base64 `data` (and a base64 `metadata.encoding`);
 * `json/plain` payloads are parsed into objects. Returns a pretty-printed JSON string for
 * display, or null when no input was recorded.
 */
export function extractWorkflowInput(events: ReadonlyArray<Record<string, unknown>>): string | null {
  const started = events.find((e) => e['eventType'] === 'WORKFLOW_EXECUTION_STARTED');
  if (!started) return null;
  const attrs = started['attributes'] as { input?: { payloads?: Array<{ data?: unknown; metadata?: { encoding?: unknown } }> } } | undefined;
  const payloads = attrs?.input?.payloads;
  if (!Array.isArray(payloads) || payloads.length === 0) return null;
  const decoded = payloads.map((p) => {
    if (typeof p?.data !== 'string') return p;
    try {
      const text = base64ToUtf8(p.data);
      const encoding = typeof p?.metadata?.encoding === 'string' ? base64ToUtf8(p.metadata.encoding) : '';
      if (encoding.includes('json')) {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      return text;
    } catch {
      return p;
    }
  });
  return jsonPretty(decoded.length === 1 ? decoded[0] : decoded);
}
