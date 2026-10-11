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

import { describe, expect, it } from 'vitest';
import { ANY_TIME, buildFormResult, CUSTOM_RANGE, emptyWorkQueueMessage, formIsAuthoritative, formValuesForRaw, formValuesFromObject, HUMAN_TASKS_DEFAULT_TIME_RANGE, parseFormSchema, parseRawJson, timeRangeBounds, type FormField } from './helpers';

// The schema a review activity's arguments arrive with: free text, a number, a nested group.
const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    note: { type: 'string' },
    count: { type: 'integer' },
    address: { type: 'object', properties: { city: { type: 'string' } } },
  },
  required: ['note'],
});

const fields = (): FormField[] => {
  const parsed = parseFormSchema(SCHEMA);
  if (!parsed) throw new Error('fixture schema must parse into fields');
  return parsed;
};

const MULTILINE = 'Dear customer,\n\nYour order shipped.\n';

describe('buildFormResult', () => {
  it('submits a string exactly as entered, including its line breaks', () => {
    const f = fields();
    const values = formValuesFromObject(f, { note: MULTILINE, count: 2 });
    const { result, errors } = buildFormResult(f, values);

    expect(errors).toEqual({});
    // The trailing newline matters: trimming it is what made a retried activity fail again.
    expect(result['note']).toBe(MULTILINE);
  });

  it('keeps whitespace a person deliberately typed around a value', () => {
    const f = fields();
    const { result } = buildFormResult(f, { note: '  padded  ' });

    expect(result['note']).toBe('  padded  ');
  });

  it('still trims when coercing a number, and still reports a blank required field', () => {
    const f = fields();
    const { result } = buildFormResult(f, { note: ' n ', count: '  7  ' });
    expect(result['count']).toBe(7);

    const blank = buildFormResult(f, { note: '   ' });
    expect(blank.errors['note']).toBe('Note is required.');
    expect('note' in blank.result).toBe(false);
  });

  it('round-trips a multiline value through the form unchanged', () => {
    const f = fields();
    const original = { note: MULTILINE, count: 1, address: { city: 'Colombo' } };
    const { result } = buildFormResult(f, formValuesFromObject(f, original));

    expect(result).toEqual(original);
  });
});

describe('formValuesForRaw', () => {
  it('keeps keys the schema never described, so raw mode can reach them', () => {
    const f = fields();
    const recorded = { note: MULTILINE, count: 3, undeclared: 'keep me' };
    const seeded = formValuesForRaw(f, formValuesFromObject(f, recorded), recorded);

    expect(seeded).toEqual(recorded);
    // The submit projection is what raw mode used to open on, and it drops the extra key.
    expect(buildFormResult(f, formValuesFromObject(f, recorded)).result).not.toHaveProperty('undeclared');
  });

  it('keeps a value the schema cannot coerce as the text that was typed', () => {
    const f = fields();
    const base = { note: 'n', count: 3 };
    const halfTyped = { ...formValuesFromObject(f, base), count: '12abc' };

    expect(formValuesForRaw(f, halfTyped, base)['count']).toBe('12abc');
    // buildFormResult would drop it entirely, so switching to JSON lost what was being typed.
    const built = buildFormResult(f, halfTyped);
    expect('count' in built.result).toBe(false);
    expect(built.errors['count']).toBeDefined();
  });

  it('lays the form’s edits over the recorded value', () => {
    const f = fields();
    const base = { note: 'before', count: 3, address: { city: 'Colombo' } };
    const edited = { ...formValuesFromObject(f, base), note: 'after\nwith a break' };

    expect(formValuesForRaw(f, edited, base)).toEqual({ note: 'after\nwith a break', count: 3, address: { city: 'Colombo' } });
  });

  it('keeps a value that was already blank, which nobody cleared', () => {
    const f = fields();
    const base = { note: '', count: 3 };
    const untouched = formValuesFromObject(f, base);

    // An empty string the caller sent is a value; dropping its key would change what is submitted.
    expect(formValuesForRaw(f, untouched, base)).toEqual({ note: '', count: 3 });
  });

  it('drops a field that was cleared, rather than resurrecting it from the base', () => {
    const f = fields();
    const base = { note: 'n', count: 3 };
    const cleared = { ...formValuesFromObject(f, base), count: '' };

    expect(formValuesForRaw(f, cleared, base)).toEqual({ note: 'n' });
  });

  it('works with no base, and ignores a base that is not an object', () => {
    const f = fields();
    const values = formValuesFromObject(f, { note: 'n', count: 1 });

    expect(formValuesForRaw(f, values)).toEqual({ note: 'n', count: 1 });
    expect(formValuesForRaw(f, values, 'not an object')).toEqual({ note: 'n', count: 1 });
    expect(formValuesForRaw(f, values, null)).toEqual({ note: 'n', count: 1 });
  });
});

describe('parseRawJson', () => {
  it('treats blank as an empty object and rejects invalid JSON', () => {
    expect(parseRawJson('   ')).toEqual({ value: {} });
    expect(parseRawJson('{"a":1}')).toEqual({ value: { a: 1 } });
    expect(parseRawJson('{ not json')).toBeNull();
  });

  it('submits what was typed verbatim, including newlines inside a string', () => {
    const parsed = parseRawJson(JSON.stringify({ note: MULTILINE }));
    expect(parsed?.value).toEqual({ note: MULTILINE });
  });
});

describe('formIsAuthoritative', () => {
  it('is true only while the form is the thing on screen', () => {
    const f = fields();

    expect(formIsAuthoritative(f, false)).toBe(true);
    // Raw mode bypasses the form: what it holds is not what will be submitted.
    expect(formIsAuthoritative(f, true)).toBe(false);
    // No schema, no form — the JSON editor is all there is, in either mode.
    expect(formIsAuthoritative(null, false)).toBe(false);
    expect(formIsAuthoritative(null, true)).toBe(false);
  });
});

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const HOUR = 60 * 60_000;
const NO_CUSTOM = { start: '', end: '' };

describe('timeRangeBounds', () => {
  it('bounds the Human Tasks default instead of listing every task execution', () => {
    // An unbounded default made the inbox's first load read the integration's whole task history (#2510).
    expect(HUMAN_TASKS_DEFAULT_TIME_RANGE).not.toBe(ANY_TIME);
    expect(timeRangeBounds(HUMAN_TASKS_DEFAULT_TIME_RANGE, NOW, NO_CUSTOM)).toEqual({
      startTimeFrom: new Date(NOW - 24 * HOUR).toISOString(),
      startTimeTo: new Date(NOW).toISOString(),
    });
  });

  it('offers a seven-day window', () => {
    expect(timeRangeBounds('Past 7 days', NOW, NO_CUSTOM)).toEqual({
      startTimeFrom: '2026-10-04T12:00:00.000Z',
      startTimeTo: '2026-10-11T12:00:00.000Z',
    });
  });

  it('sends no bounds for Any time or an unknown label', () => {
    expect(timeRangeBounds(ANY_TIME, NOW, NO_CUSTOM)).toEqual({});
    expect(timeRangeBounds('Past fortnight', NOW, NO_CUSTOM)).toEqual({});
  });

  it('converts a custom range from local inputs and drops an empty or invalid end', () => {
    const start = '2026-10-01T09:30';
    expect(timeRangeBounds(CUSTOM_RANGE, NOW, { start, end: '' })).toEqual({ startTimeFrom: new Date(start).toISOString(), startTimeTo: undefined });
    expect(timeRangeBounds(CUSTOM_RANGE, NOW, { start, end: 'not-a-date' }).startTimeTo).toBeUndefined();
  });
});

describe('emptyWorkQueueMessage', () => {
  it('names the time range when one is applied, so older pending tasks are not mistaken for none', () => {
    expect(emptyWorkQueueMessage('PENDING', timeRangeBounds(HUMAN_TASKS_DEFAULT_TIME_RANGE, NOW, NO_CUSTOM))).toBe('No pending tasks in the selected time range.');
    expect(emptyWorkQueueMessage('All', { startTimeFrom: '2026-10-11T11:00:00.000Z' })).toBe('No tasks in the selected time range.');
  });

  it('keeps the plain message for Any time', () => {
    expect(emptyWorkQueueMessage('COMPLETED', {})).toBe('No completed tasks.');
    expect(emptyWorkQueueMessage('All', {})).toBe('No tasks.');
  });
});
