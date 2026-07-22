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

/**
 * Reverses the ICP proxy's role-name escaping for display (`%2C` → `,`).
 * The proxy escapes commas in each role name before comma-joining the `x-user-roles`
 * header (see escapeRoleName in icp_server/workflow_proxy_service.bal), and the runtime
 * echoes the escaped names back in task role lists.
 */
export function unescapeRoleName(role: string): string {
  return role.replace(/%2C/gi, ',');
}

/** Shared heading style for workflow cards, sections, and form/dialog titles: bold, muted gray. */
export const sectionTitleSx = { fontWeight: 700, color: 'text.secondary' } as const;

/**
 * Splits a qualified task/activity name like `placeOrderWorkflow.approveOrder` (optionally
 * prefixed `workflow-`) into its workflow and task parts. Names without a qualifier map to
 * `{ task: name }`.
 */
export function splitQualifiedName(name?: string): { workflow?: string; task?: string } {
  if (!name) return {};
  const clean = name.replace(/^workflow-/, '');
  const idx = clean.indexOf('.');
  if (idx <= 0) return { task: clean };
  return { workflow: clean.slice(0, idx), task: clean.slice(idx + 1) };
}

/** Converts a key like `orderId` or `error_code` to a display label like `Order Id`. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A form field derived from a JSON schema property. Object properties that themselves declare
 * `properties` become groups (`fields` set, rendered as a nested set of inputs) rather than a
 * single JSON textarea. Leaf-field values are keyed by their dotted path (e.g. `orderInfo.id`).
 */
export interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  description?: string;
  enumValues?: string[];
  fields?: FormField[];
}

/** Joins a parent path and a field name into the dotted key used for a leaf field's value. */
export const fieldPath = (prefix: string, name: string): string => (prefix ? `${prefix}.${name}` : name);

/** Parses a JSON-schema object (already-parsed) into a field list, recursing into nested objects. */
function parseObjectSchema(s: unknown): FormField[] | null {
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return null;
  const obj = s as Record<string, unknown>;
  const props = obj.properties;
  if (props === null || typeof props !== 'object' || Array.isArray(props)) return null;
  const required = new Set(Array.isArray(obj.required) ? obj.required.filter((r): r is string => typeof r === 'string') : []);
  const fields = Object.entries(props as Record<string, unknown>).map(([name, def]): FormField => {
    const d = (def !== null && typeof def === 'object' ? def : {}) as Record<string, unknown>;
    const type = typeof d.type === 'string' ? d.type : 'string';
    // An object with its own properties becomes a group; a freeform object stays a JSON textarea.
    const nested = type === 'object' ? parseObjectSchema(d) : null;
    return {
      name,
      type,
      label: typeof d.title === 'string' ? d.title : humanizeKey(name),
      required: required.has(name),
      description: typeof d.description === 'string' ? d.description : undefined,
      enumValues: Array.isArray(d.enum) ? d.enum.map(String) : undefined,
      ...(nested ? { fields: nested } : {}),
    };
  });
  return fields.length > 0 ? fields : null;
}

/**
 * Parses a JSON schema (an object, or a JSON string of one) into a field list for form rendering.
 * Nested object schemas are expanded into nested field groups. Returns null when absent or not an
 * object schema with properties.
 */
export function parseFormSchema(schema: unknown): FormField[] | null {
  let s: unknown = schema;
  if (typeof s === 'string') {
    try {
      s = JSON.parse(s);
    } catch {
      return null;
    }
  }
  return parseObjectSchema(s);
}

/** Coerces one leaf field's entered value to its schema type, recording any error by dotted path. */
function coerceLeaf(f: FormField, path: string, values: Record<string, string | boolean>, result: Record<string, unknown>, errors: Record<string, string>): void {
  if (f.type === 'boolean') {
    const v = values[path];
    if (typeof v === 'boolean') result[f.name] = v;
    else if (f.required) errors[path] = `${f.label} is required.`;
    return;
  }
  const raw = values[path];
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    if (f.required) errors[path] = `${f.label} is required.`;
    return;
  }
  if (f.type === 'number' || f.type === 'integer') {
    const n = Number(text);
    if (Number.isNaN(n) || (f.type === 'integer' && !Number.isInteger(n))) {
      errors[path] = f.type === 'integer' ? `${f.label} must be an integer.` : `${f.label} must be a number.`;
      return;
    }
    result[f.name] = n;
  } else if (f.type === 'object' || f.type === 'array') {
    try {
      result[f.name] = JSON.parse(text);
    } catch {
      errors[path] = `${f.label} must be valid JSON.`;
    }
  } else {
    result[f.name] = text;
  }
}

function buildLevel(fields: FormField[], values: Record<string, string | boolean>, prefix: string, errors: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    const path = fieldPath(prefix, f.name);
    if (f.fields) {
      result[f.name] = buildLevel(f.fields, values, path, errors);
    } else {
      coerceLeaf(f, path, values, result, errors);
    }
  }
  return result;
}

/**
 * Validates generated-form values against their fields and coerces them to schema types, rebuilding
 * nested objects for grouped fields. Returns the coerced result object plus per-field error messages
 * (keyed by dotted path, empty when valid).
 */
export function buildFormResult(fields: FormField[], values: Record<string, string | boolean>): { result: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const result = buildLevel(fields, values, '', errors);
  return { result, errors };
}

function fillValues(fields: FormField[], source: Record<string, unknown>, prefix: string, values: Record<string, string | boolean>): void {
  for (const f of fields) {
    const path = fieldPath(prefix, f.name);
    const v = source[f.name];
    if (f.fields) {
      fillValues(f.fields, v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}, path, values);
      continue;
    }
    if (v === undefined || v === null) continue;
    if (f.type === 'boolean') {
      if (typeof v === 'boolean') values[path] = v;
    } else if (f.type === 'object' || f.type === 'array') {
      values[path] = typeof v === 'string' ? v : jsonPretty(v);
    } else {
      values[path] = typeof v === 'string' ? v : String(v);
    }
  }
}

/**
 * Builds generated-form values (the shape `SchemaFormFields` expects, keyed by dotted path) from a
 * source object — the inverse of `buildFormResult`. Used to pre-populate a form from existing
 * arguments (e.g. a review activity's `activityArgs`). Object/array leaf fields are stringified to
 * JSON; numbers become their string form; booleans pass through. Keys absent from the source are skipped.
 */
export function formValuesFromObject(fields: FormField[], source: Record<string, unknown>): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  fillValues(fields, source, '', values);
  return values;
}

/** Returns a copy of `items` sorted by their `startTime`, newest first (missing/invalid times last). */
export function sortByStartTimeDesc<T extends { startTime?: string }>(items: T[]): T[] {
  const ts = (v?: string) => {
    const t = v ? Date.parse(v) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return [...items].sort((a, b) => ts(b.startTime) - ts(a.startTime));
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
