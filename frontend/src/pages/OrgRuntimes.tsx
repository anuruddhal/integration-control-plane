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

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  ListingTable,
  PageContent,
  PageTitle,
  Stack,
  Tab,
  TablePagination,
  Tabs,
  Typography,
} from '@wso2/oxygen-ui';
import { Check, Copy, FileText, Plus, Server, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useQueries } from '@tanstack/react-query';
import { gql } from '../api/graphql';
import { useAllEnvironments, useOrgSecrets, ORG_RUNTIMES_QUERY, type GqlEnvironment, type GqlOrgSecret, type GqlRuntime } from '../api/queries';
import { useCreateOrgSecret, useDeleteRuntime, useRevokeOrgSecret } from '../api/mutations';
import { formatDistanceToNow } from '../utils/time';
import SearchField from '../components/SearchField';
import { LogFilesDrawer } from '../components/LogFilesDrawer';
import EmptyListing from '../components/EmptyListing';
import Authorized from '../components/Authorized';
import { Permissions } from '../constants/permissions';
import type { OrgScope } from '../nav';

const drawerSx = {
  '& .MuiDrawer-paper': { width: '45%', maxWidth: 560, minWidth: 360, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider' },
};

function SecretDrawer({ env, onClose }: { env: GqlEnvironment; onClose: () => void }) {
  const { data: allSecrets = [], isLoading } = useOrgSecrets(env.id);
  const revokeMutation = useRevokeOrgSecret();
  const [revoking, setRevoking] = useState<string | null>(null);

  const unboundSecrets = allSecrets.filter((s) => !s.bound);

  const confirmRevoke = (keyId: string) => {
    revokeMutation.mutate(keyId, { onSettled: () => setRevoking(null) });
  };

  return (
    <Drawer anchor="right" open variant="persistent" sx={drawerSx}>
      <Stack sx={{ p: 3, height: '100%', overflow: 'auto' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">Secrets — {env.name}</Typography>
          <IconButton size="small" onClick={onClose} aria-label="close">
            <X size={18} />
          </IconButton>
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {isLoading ? (
          <CircularProgress sx={{ mx: 'auto', my: 4 }} />
        ) : unboundSecrets.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No unbound secrets for this environment.
          </Typography>
        ) : (
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Key ID</ListingTable.Cell>
                <ListingTable.Cell>Created</ListingTable.Cell>
                <ListingTable.Cell>Created By</ListingTable.Cell>
                <ListingTable.Cell align="right">Action</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {unboundSecrets.map((secret) => (
                <ListingTable.Row key={secret.keyId}>
                  <ListingTable.Cell>
                    <code>{secret.keyId}....</code>
                  </ListingTable.Cell>
                  <ListingTable.Cell>{formatDistanceToNow(secret.createdAt)}</ListingTable.Cell>
                  <ListingTable.Cell>{secret.createdBy ?? '—'}</ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <IconButton size="small" color="error" aria-label={`Revoke ${secret.keyId}`} onClick={() => setRevoking(secret.keyId)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        )}
      </Stack>

      {revoking && (
        <Dialog open onClose={() => setRevoking(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Revoke Secret</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Revoke secret <strong>{revoking}....</strong>? Any runtime using this secret will no longer be able to authenticate.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={revokeMutation.isPending} onClick={() => confirmRevoke(revoking)}>
              Revoke
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Drawer>
  );
}

function miToml(envName: string, secret: string): string {
  return `[icp_config]
enabled = true
environment = "${envName}"
project = "<project name>"
integration = "<integration name>"
runtime = "<unique id for the runtime>"
secret = "${secret}"
# icp_url = "https://<hostname>:9443"`;
}

function biToml(envName: string, secret: string): string {
  return `[wso2.icp.runtime.bridge]
environment = "${envName}"
project = "<project name>"
integration = "<integration name>"
runtime = "<unique id for the runtime>"
secret = "${secret}"
# serverUrl="https://<hostname>:9445"`;
}

function AddRuntimeModal({ env, onClose }: { env: GqlEnvironment; onClose: () => void }) {
  const createMutation = useCreateOrgSecret();
  const [secret, setSecret] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    createMutation.mutate(env.id, {
      onSuccess: (s) => setSecret(s),
      onError: (e) => setError(e.message),
    });
  };

  const config = secret ? (tab === 0 ? miToml(env.name, secret) : biToml(env.name, secret)) : null;

  const handleCopy = async () => {
    if (!config) return;
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Runtime — {env.name}</DialogTitle>
      <DialogContent>
        {!secret ? (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <DialogContentText sx={{ mb: 2 }}>
              Generate a new secret for this environment. The secret will be shown once — copy it before closing.
            </DialogContentText>
            <Button variant="contained" onClick={handleGenerate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Generating...' : 'Generate Secret'}
            </Button>
          </>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Copy this secret now. It will not be shown again.
            </Alert>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
              <Tab label="MI" />
              <Tab label="BI" />
            </Tabs>
            <DialogContentText sx={{ mb: 1 }}>
              Add the following configuration to your runtime's {tab === 0 ? 'deployment.toml' : 'Config.toml'} file:
            </DialogContentText>
            <Box sx={{ position: 'relative' }}>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  overflow: 'auto',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {config}
              </Box>
              <IconButton size="small" onClick={handleCopy} sx={{ position: 'absolute', top: 8, right: 8 }} aria-label="Copy">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </IconButton>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function formatPlatform(r: GqlRuntime): string {
  if (!r.platformVersion) return r.platformName ?? '—';
  return /^\d/.test(r.platformVersion) ? `${r.platformName} ${r.platformVersion}` : r.platformVersion;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function EnvironmentRuntimeCard({ env, runtimes, onDelete, onViewLogs }: { env: GqlEnvironment; runtimes: GqlRuntime[]; onDelete: (r: GqlRuntime) => void; onViewLogs: (r: GqlRuntime) => void }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const filtered = runtimes.filter((r) => !query || r.runtimeId.toLowerCase().includes(query.toLowerCase()) || r.runtimeType.toLowerCase().includes(query.toLowerCase()) || (r.component?.displayName ?? '').toLowerCase().includes(query.toLowerCase()));
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paged = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  return (
    <>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {env.name}
              </Typography>
              <Chip label={`${filtered.length} runtime${filtered.length !== 1 ? 's' : ''}`} size="small" color={filtered.length > 0 ? 'primary' : 'default'} />
            </Stack>
            <Authorized permissions={[Permissions.ENVIRONMENT_MANAGE, Permissions.ENVIRONMENT_MANAGE_NONPROD]}>
              <Stack direction="row" gap={1}>
                <Button variant="outlined" size="small" onClick={() => setDrawerOpen(true)}>
                  Manage Secrets
                </Button>
                <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
                  Add Runtime
                </Button>
              </Stack>
            </Authorized>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <SearchField value={query} onChange={setQuery} placeholder="Search runtimes..." sx={{ mb: 2, width: '100%', maxWidth: 400 }} />
          {filtered.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {query ? 'No runtimes match your search.' : 'No runtimes registered for this environment.'}
            </Typography>
          ) : (
            <>
              <ListingTable>
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>Runtime ID</ListingTable.Cell>
                    <ListingTable.Cell>Type</ListingTable.Cell>
                    <ListingTable.Cell>Component</ListingTable.Cell>
                    <ListingTable.Cell>Status</ListingTable.Cell>
                    <ListingTable.Cell>Version</ListingTable.Cell>
                    <ListingTable.Cell>Platform</ListingTable.Cell>
                    <ListingTable.Cell>OS</ListingTable.Cell>
                    <ListingTable.Cell>Registration Time</ListingTable.Cell>
                    <ListingTable.Cell>Last Heartbeat</ListingTable.Cell>
                    <ListingTable.Cell>Actions</ListingTable.Cell>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {paged.map((r) => (
                    <ListingTable.Row key={r.runtimeId}>
                      <ListingTable.Cell>{r.runtimeId}</ListingTable.Cell>
                      <ListingTable.Cell>{r.runtimeType}</ListingTable.Cell>
                      <ListingTable.Cell>{r.component?.displayName ?? '—'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip label={r.status} size="small" color={r.status === 'RUNNING' ? 'success' : 'default'} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>{r.version || '—'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2">{formatPlatform(r)}</Typography>
                        {r.platformHome && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {r.platformHome}
                          </Typography>
                        )}
                      </ListingTable.Cell>
                      <ListingTable.Cell>{[r.osName, r.osVersion].filter(Boolean).join(' ')}</ListingTable.Cell>
                      <ListingTable.Cell>{r.registrationTime ? formatDate(r.registrationTime) : '—'}</ListingTable.Cell>
                      <ListingTable.Cell>{r.lastHeartbeat ? formatDate(r.lastHeartbeat) : '—'}</ListingTable.Cell>
                      <ListingTable.Cell>
                        <Stack direction="row" gap={0.5}>
                          {r.runtimeType === 'MI' && (
                            <IconButton size="small" color="primary" aria-label={`View logs for ${r.runtimeId}`} disabled={r.status !== 'RUNNING'} onClick={() => onViewLogs(r)} title="View Logs">
                              <FileText size={16} />
                            </IconButton>
                          )}
                          <IconButton size="small" color="error" aria-label={`Delete runtime ${r.runtimeId}`} disabled={r.status === 'RUNNING'} onClick={() => onDelete(r)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Stack>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  ))}
                </ListingTable.Body>
              </ListingTable>
              {filtered.length > rowsPerPage && (
                <TablePagination
                  sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1 }}
                  component="div"
                  count={filtered.length}
                  page={safePage}
                  onPageChange={(_, p) => setPage(p)}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={(e) => {
                    setRowsPerPage(parseInt(e.target.value, 10));
                    setPage(0);
                  }}
                  rowsPerPageOptions={[5, 10, 25]}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {drawerOpen && <SecretDrawer env={env} onClose={() => setDrawerOpen(false)} />}
      {addOpen && <AddRuntimeModal env={env} onClose={() => setAddOpen(false)} />}
    </>
  );
}

export default function OrgRuntimes(_scope: OrgScope): JSX.Element {
  const { data: environments, isLoading: envsLoading } = useAllEnvironments();
  const [deleting, setDeleting] = useState<GqlRuntime | null>(null);
  const [viewingLogs, setViewingLogs] = useState<GqlRuntime | null>(null);
  const deleteMutation = useDeleteRuntime();

  const runtimeQueries = useQueries({
    queries: (environments ?? []).map((env) => ({
      queryKey: ['runtimes', env.id],
      queryFn: () => gql<{ runtimes: GqlRuntime[] }>(ORG_RUNTIMES_QUERY, { environmentId: env.id }).then((d) => d.runtimes),
    })),
  });

  const isLoading = envsLoading || runtimeQueries.some((q) => q.isLoading);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Runtimes</PageTitle.Header>
      </PageTitle>

      {isLoading ? (
        <CircularProgress sx={{ display: 'block', mx: 'auto', py: 8 }} />
      ) : !environments?.length ? (
        <EmptyListing icon={<Server size={48} />} title="No environments found" description="Create an environment first to register runtimes." />
      ) : (
        environments.map((env, index) => {
          const runtimes = runtimeQueries[index]?.data ?? [];
          return <EnvironmentRuntimeCard key={env.id} env={env} runtimes={runtimes} onDelete={setDeleting} onViewLogs={setViewingLogs} />;
        })
      )}

      {viewingLogs && <LogFilesDrawer runtimeId={viewingLogs.runtimeId} onClose={() => setViewingLogs(null)} />}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Delete Runtime</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete runtime <strong>{deleting.runtimeId}</strong>?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="contained" color="error" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting.runtimeId, { onSuccess: () => setDeleting(null) })}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
