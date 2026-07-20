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

import { Box, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import type { FormField } from './helpers';

// Marks the required-field asterisk red on generated form fields.
const requiredAsteriskSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } } as const;

/**
 * Renders editable inputs for fields derived from a JSON schema (see `parseFormSchema`):
 * a Yes/No toggle for booleans, a dropdown for enums, numeric/text inputs otherwise, with
 * required fields marked by a red asterisk. Values are kept as entered; coercion to schema
 * types happens at submit via `buildFormResult`.
 */
export default function SchemaFormFields({ fields, values, errors, onChange }: { fields: FormField[]; values: Record<string, string | boolean>; errors: Record<string, string>; onChange: (name: string, value: string | boolean) => void }) {
  return (
    <Stack gap={2}>
      {fields.map((f) =>
        f.type === 'boolean' ? (
          <Box key={f.name}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {f.label}
              {f.required && (
                <Typography component="span" color="error.main">
                  {' *'}
                </Typography>
              )}
            </Typography>
            <ToggleButtonGroup exclusive size="small" value={typeof values[f.name] === 'boolean' ? (values[f.name] ? 'yes' : 'no') : null} onChange={(_, v) => v !== null && onChange(f.name, v === 'yes')}>
              <ToggleButton value="yes" sx={{ px: 2 }}>
                Yes
              </ToggleButton>
              <ToggleButton value="no" sx={{ px: 2 }}>
                No
              </ToggleButton>
            </ToggleButtonGroup>
            {(errors[f.name] || f.description) && (
              <Typography variant="caption" color={errors[f.name] ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
                {errors[f.name] || f.description}
              </Typography>
            )}
          </Box>
        ) : (
          <TextField
            key={f.name}
            label={f.label}
            fullWidth
            required={f.required}
            select={!!f.enumValues}
            multiline={f.type === 'object' || f.type === 'array'}
            minRows={f.type === 'object' || f.type === 'array' ? 3 : undefined}
            type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
            value={typeof values[f.name] === 'string' ? values[f.name] : ''}
            onChange={(e) => onChange(f.name, e.target.value)}
            error={!!errors[f.name]}
            helperText={errors[f.name] || f.description || (f.type === 'object' || f.type === 'array' ? 'Enter as JSON.' : undefined)}
            sx={requiredAsteriskSx}
            slotProps={f.type === 'object' || f.type === 'array' ? { input: { sx: { fontFamily: 'monospace', fontSize: 13 } } } : undefined}>
            {f.enumValues?.map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </TextField>
        ),
      )}
    </Stack>
  );
}
