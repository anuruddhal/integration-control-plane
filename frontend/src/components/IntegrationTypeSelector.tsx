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

import { Box, Card, CardContent, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { INTEGRATION_TYPES, type IntegrationType } from '../constants/integrationTypes';

interface IntegrationTypeSelectorProps {
  selected: IntegrationType;
  onSelect: (type: IntegrationType) => void;
}

/**
 * Tile picker for the integration type, mirroring the devant integration-create
 * flow. Exposed as a radio group so the choice is reachable by keyboard and
 * addressable by role in tests — the tiles are not native inputs.
 */
export default function IntegrationTypeSelector({ selected, onSelect }: IntegrationTypeSelectorProps): JSX.Element {
  return (
    <Box role="radiogroup" aria-label="Integration Type" sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {INTEGRATION_TYPES.map((opt) => {
        const isActive = selected === opt.id;
        return (
          <Card
            key={opt.id}
            role="radio"
            aria-checked={isActive}
            aria-label={opt.title}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(opt.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(opt.id);
              }
            }}
            sx={{
              width: '25%',
              minWidth: 180,
              border: 2,
              borderColor: isActive ? 'primary.main' : 'divider',
              bgcolor: isActive ? 'primary.50' : 'background.paper',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background-color 0.15s',
              '&:hover': { borderColor: isActive ? 'primary.main' : 'primary.light' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Typography variant="body2" fontWeight={600} sx={{ color: isActive ? 'primary.main' : 'text.primary', mb: 0.5 }}>
                {opt.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5, lineHeight: 1.4, flex: 1 }}>
                {opt.description}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {opt.icons.map((item) => (
                  <Tooltip key={item.label} title={item.label} placement="top">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        color: isActive ? 'primary.main' : 'text.secondary',
                      }}>
                      {item.icon}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
