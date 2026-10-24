// A12 Settings. Tailwind Plus: page-examples/settings-screens (01 sidebar: sectioned settings), data-display/description-lists
// (03 left aligned in card), feedback/alerts.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { feedApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { config, absoluteUrl } from '@/core/config';
import { useAuth } from '@/hooks/useAuth';
import { PageHeading } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ROLES, ROLE_LABELS, type Role } from '@/core/schema';

function Row({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
      <dt className="text-sm font-medium text-gray-900 dark:text-white">{label}</dt>
      <dd className="mt-1 flex items-start gap-4 text-sm text-gray-700 sm:col-span-2 sm:mt-0 dark:text-gray-400">
        <span className="min-w-0 flex-1 break-all">{value}</span>
        {copy && (
          <button type="button" className="shrink-0 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400" onClick={() => { void navigator.clipboard?.writeText(copy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            {copied ? 'Copied' : 'Copy'}<span className="sr-only"> {label}</span>
          </button>
        )}
      </dd>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 py-10 md:grid-cols-3">
      <div>
        <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </div>
  );
}

const card = 'overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10';

export function Settings() {
  const { me } = useAuth();
  const key = useQuery({ queryKey: ['public-key'], queryFn: feedApi.publicKey, staleTime: Infinity });
  const api = absoluteUrl(config.apiBase);
  const stable = absoluteUrl(feedApi.catalogUrl('stable'));
  const beta = absoluteUrl(feedApi.catalogUrl('beta'));
  const keyUrl = absoluteUrl(feedApi.publicKeyUrl());
  const feedRoot = absoluteUrl(config.feedBase);

  return (
    <div>
      <PageHeading title="Settings" meta="Endpoints, feed signing and roles" />
      <div className="divide-y divide-gray-900/10 dark:divide-white/10">
        <Section title="API" description="Where this admin sends requests. Set VITE_API_BASE at build time to point at another origin.">
          <dl className={`${card} divide-y divide-gray-100 dark:divide-white/5`}>
            <Row label="API base" value={<code>{api}</code>} copy={api} />
            <Row label="Admin routes" value={<code>{api}/admin/*</code>} />
            <Row label="Signed in as" value={me ? `${me.id} · ${ROLE_LABELS[me.role] ?? me.role}` : '—'} />
          </dl>
        </Section>
        <Section title="FrameFlow feed" description="The signed catalog FrameFlow installs from. Public assets go to stable; internal ones to beta.">
          <dl className={`${card} divide-y divide-gray-100 dark:divide-white/5`}>
            <Row label="Stable catalog" value={<a className="text-indigo-600 dark:text-indigo-400" href={stable} target="_blank" rel="noreferrer">{stable}</a>} copy={stable} />
            <Row label="Beta catalog" value={<a className="text-indigo-600 dark:text-indigo-400" href={beta} target="_blank" rel="noreferrer">{beta}</a>} copy={beta} />
            <Row label="Signatures" value={<code>{absoluteUrl(feedApi.signatureUrl('stable'))}</code>} />
            <Row label="FrameFlow env" value={<code>WSC_ASSET_URL={feedRoot}</code>} copy={`WSC_ASSET_URL=${feedRoot}`} />
          </dl>
        </Section>
        <Section title="Signing public key" description="FrameFlow verifies catalog.json.sig with this key (WSC_ASSET_PUBLIC_KEY).">
          <div className={`${card} p-4 sm:p-6`}>
            {key.isPending ? <p className="text-sm text-gray-500">Loading…</p> : key.isError ? <Alert tone="error">{errorMessage(key.error)}</Alert> : (
              <>
                <pre aria-label="Signing public key" className="overflow-x-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800 dark:bg-white/5 dark:text-gray-200">{key.data}</pre>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(key.data)}>Copy key</Button>
                  <a className="text-sm font-semibold text-indigo-600 dark:text-indigo-400" href={keyUrl} target="_blank" rel="noreferrer">Open {keyUrl}</a>
                </div>
              </>
            )}
          </div>
        </Section>
        <Section title="Roles" description="What each Download Center role can do (packages/asset-schema). Roles are assigned in OneAuth (library_roles claim) or LIBRARY_ADMIN_TOKENS.">
          <div className={`${card} overflow-x-auto`}>
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-white/10">
              <caption className="sr-only">Role permissions</caption>
              <thead><tr><th scope="col" className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">Role</th><th scope="col" className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">Permissions</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <tr key={r} className={r === me?.role ? 'bg-indigo-50/50 dark:bg-indigo-500/10' : undefined}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap text-gray-900 dark:text-white">{ROLE_LABELS[r]}{r === me?.role && <span className="sr-only"> (you)</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{ROLES[r].join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Not configurable here yet" description="Blueprint A12 items with no API.">
          <Alert tone="info" items={['Storage / CDN / processing limits (needs GET/PUT /admin/settings)', 'API clients and webhooks', 'Role assignment (needs /admin/users or OneAuth admin)', 'Collections (A9) and analytics drill-down (A11)']}>These are shown for completeness and are disabled until the endpoints exist.</Alert>
        </Section>
      </div>
    </div>
  );
}
