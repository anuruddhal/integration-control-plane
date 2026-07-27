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
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Shared HTTP method badge styling — used by ArtifactTabs' resource lists (ResourceRow) and
// OpenApiDefinitionsDrawer's Swagger UI overrides, so both views show a service's resources
// identically (colors, badge, and label text). Kept in its own module (rather than exported
// from ArtifactTabs) so the swagger-ui drawer, which is lazy-loaded into its own chunk to keep
// swagger-ui-react out of the main bundle, doesn't statically import ArtifactTabs back.
export const HTTP_METHOD_BADGE_COLORS: Record<string, string> = {
  GET: '#0095FF',
  POST: '#36B475',
  PUT: '#FF9D52',
  DELETE: '#FE523C',
  PATCH: '#01CEB5',
};

export const DEFAULT_METHOD_BADGE_COLOR = '#9e9e9e';

// Text formatting for the method badge itself (e.g. "GET"). Consumers add their own
// background/text color and padding on top of this.
export const METHOD_BADGE_TEXT_SX = {
  fontWeight: 700,
  fontSize: '11px',
  minWidth: 72,
  borderRadius: 0.5,
  textAlign: 'center',
} as const;

// Text formatting for the resource path/label next to the method badge. Consumers add their
// own flex/color/font-family on top of this.
export const RESOURCE_LABEL_TEXT_SX = {
  fontSize: '13px',
  fontWeight: 500,
  wordBreak: 'break-word',
} as const;
