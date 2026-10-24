// A7 Processing Jobs. Tailwind Plus: navigation/tabs (08 with badges), lists/tables (03), elements/badges, feedback/alerts.
// Jobs come from GET /admin/jobs (apps/workers claim and run them); failed or finished ones can be reprocessed.
// Secondary sections: uploads checked in this tab, and assets whose status is processing or failed.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useNotify } from '@/components/ui/Notifications';
import { Tabs } from '@/components/ui/Layout';
import type { Job, JobStatus } from '@/types/api';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { useSessionUploads, uploadSession } from '@/services/uploadSession';
import { PageHeading } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { TableCard, TBody, EmptyRow, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { checkProblem, checksPassed } from '@/components/Checks';
import { typeName, label } from '@/core/schema';
import { msg, t, type MessageKey } from '@/i18n';
import { classNames, formatBytes, timeAgo } from '@/core/format';

const JOB_TABS: { key: JobStatus | 'all'; name: MessageKey }[] = [
  { key: 'all', name: msg('All') },
  { key: 'queued', name: msg('Queued') },
  { key: 'running', name: msg('Running') },
  { key: 'failed', name: msg('Failed') },
  { key: 'done', name: msg('Done') },
  { key: 'cancelled', name: msg('Cancelled') },
];

/** Poll every 3 s while anything is queued or running. */
export const jobsRefetchInterval = (jobs: Job[] | undefined): number | false => (jobs?.some((j) => j.status === 'queued' || j.status === 'running') ? 3000 : false);

function JobsSection() {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const [tab, setTab] = useState<JobStatus | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const all = useQuery({ queryKey: ['jobs', 'all'], queryFn: () => adminApi.jobs(), refetchInterval: (q) => jobsRefetchInterval(q.state.data) });
  const filtered = useQuery({ queryKey: ['jobs', tab], queryFn: () => adminApi.jobs(tab === 'all' ? '' : tab), enabled: tab !== 'all', refetchInterval: (q) => jobsRefetchInterval(all.data ?? q.state.data) });
  const assets = useQuery({ queryKey: ['assets', { forJobs: true }], queryFn: () => adminApi.listAssets({}) });
  const byId = new Map((assets.data?.data ?? []).map((a) => [a.id, a]));
  const jobs = [...((tab === 'all' ? all.data : filtered.data) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const counts = Object.fromEntries(JOB_TABS.map((t) => [t.key, t.key === 'all' ? all.data?.length : all.data?.filter((j) => j.status === t.key).length]));
  const live = jobsRefetchInterval(all.data) !== false;

  const reprocess = async (j: Job) => {
    setBusy(j.id);
    try {
      await adminApi.reprocess(j.asset_id, j.version);
      notify(t('Reprocessing queued'), `${byId.get(j.asset_id)?.title ?? j.asset_id} v${j.version}`);
      await qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['asset', j.asset_id] });
    } catch (e) {
      fail(t('Couldn’t reprocess'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const canEdit = (assetId: string) => can('asset.edit.all') || (can('asset.edit.own') && byId.get(assetId)?.created_by === me?.id);

  return (
    <section aria-labelledby="jobs-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="jobs-h" className="text-base font-semibold text-gray-900 dark:text-white">{t('Jobs')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400" role="status">{live ? t('Refreshing every 3 s while jobs are queued or running') : t('Up to date')}</p>
      </div>
      <Tabs label={t('Job status')} current={tab} onChange={setTab} tabs={JOB_TABS.map((x) => ({ key: x.key, name: t(x.name), count: counts[x.key] }))} />
      {all.isPending ? <Loading /> : all.isError ? <Alert tone="error">{errorMessage(all.error)}</Alert> : (
        <TableCard caption={t('Processing jobs')}>
          <thead>
            <tr>
              <th scope="col" className={thFirst}>{t('Asset')}</th>
              <th scope="col" className={th}>{t('Status')}</th>
              <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Attempts')}</th>
              <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('Worker')}</th>
              <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Previews / error')}</th>
              <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Updated')}</th>
              <th scope="col" className={th}><span className="sr-only">{t('Actions')}</span></th>
            </tr>
          </thead>
          <TBody>
            {jobs.map((j) => {
              const a = byId.get(j.asset_id);
              return (
                <tr key={j.id} data-status={j.status}>
                  <td className={tdFirst}>
                    <Link to={`/admin/assets/${j.asset_id}`} className="hover:text-indigo-600">{a?.title ?? j.asset_id}</Link>
                    <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">{typeName(j.type)} · <span className="font-mono">v{j.version}</span></span>
                  </td>
                  <td className={td}><StatusBadge status={j.status} /></td>
                  <td className={classNames(td, 'hidden tabular-nums md:table-cell')}>{j.attempts}</td>
                  <td className={classNames(td, 'hidden font-mono text-xs lg:table-cell')}>{j.worker_id ?? '—'}</td>
                  <td className={classNames(td, 'hidden max-w-xs whitespace-normal md:table-cell')}>
                    {j.error ? <span className="text-red-600 dark:text-red-400">{j.error}</span> : Object.keys(j.previews ?? {}).length ? Object.keys(j.previews).join(', ') : '—'}
                  </td>
                  <td className={classNames(td, 'hidden sm:table-cell')}><time dateTime={j.finished_at ?? j.started_at ?? j.created_at}>{timeAgo(j.finished_at ?? j.started_at ?? j.created_at)}</time></td>
                  <td className={classNames(td, 'text-right')}>
                    {['failed', 'done', 'cancelled'].includes(j.status) && canEdit(j.asset_id) && (
                      <Button size="sm" variant={j.status === 'failed' ? 'soft' : 'link'} loading={busy === j.id} onClick={() => void reprocess(j)}>
                        {j.status === 'failed' ? t('Retry') : t('Reprocess')}<span className="sr-only"> {a?.title ?? j.asset_id} v{j.version}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!jobs.length && <EmptyRow colSpan={7}>{tab === 'all' ? t('No jobs yet. Uploading a version queues one; a worker (apps/workers) runs it.') : t('No {status} jobs.', { status: label(tab) })}</EmptyRow>}
          </TBody>
        </TableCard>
      )}
    </section>
  );
}

export function Processing() {
  const session = useSessionUploads();
  const [processing, failed] = useQueries({
    queries: ['processing', 'failed'].map((status) => ({ queryKey: ['assets', { status }], queryFn: () => adminApi.listAssets({ status }) })),
  });

  const recheck = async (key: string, id: string) => {
    const s = uploadSession.all().find((x) => x.key === key);
    if (!s) return;
    try {
      uploadSession.record({ ...s, upload: await adminApi.getUpload(id), error: null });
    } catch (e) {
      uploadSession.record({ ...s, error: errorMessage(e) });
    }
  };
  const assets = [...(processing.data?.data ?? []), ...(failed.data?.data ?? [])];

  return (
    <div className="space-y-8">
      <PageHeading title={t('Processing')} meta={t('Worker jobs: previews, deep checks and metadata for each uploaded version')} />
      <JobsSection />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('Upload checks in this tab')}</h2>
          {session.length > 0 && <Button size="sm" variant="secondary" onClick={() => uploadSession.clear()}>{t('Clear')}</Button>}
        </div>
        <TableCard caption={t('Uploads checked in this session')}>
          <thead>
            <tr>
              <th scope="col" className={thFirst}>{t('File')}</th>
              <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Type')}</th>
              <th scope="col" className={th}>{t('Result')}</th>
              <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Checks')}</th>
              <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('When')}</th>
              <th scope="col" className={th}><span className="sr-only">{t('Actions')}</span></th>
            </tr>
          </thead>
          <TBody>
            {session.map((s) => {
              const failedChecks = s.upload?.checks.filter((c) => !c.passed) ?? [];
              return (
                <tr key={s.key}>
                  <td className={tdFirst}><span className="block max-w-56 truncate">{s.name}</span><span className="text-xs font-normal text-gray-500">{formatBytes(s.size)}</span></td>
                  <td className={classNames(td, 'hidden sm:table-cell')}>{s.upload?.type ? typeName(s.upload.type) : '—'}</td>
                  <td className={classNames(td, 'whitespace-normal')}>
                    {s.error ? <Badge tone="red">{s.error}</Badge> : s.upload && checksPassed(s.upload.checks) ? <Badge tone="green">{t('valid')}</Badge> : <Badge tone="red">{t('blocked · {problem}', { problem: failedChecks[0] ? checkProblem(failedChecks[0]) : '—' })}</Badge>}
                  </td>
                  <td className={classNames(td, 'hidden md:table-cell')}>{s.upload ? t('{n}/{total} passed', { n: s.upload.checks.filter((c) => c.passed).length, total: s.upload.checks.length }) : '—'}</td>
                  <td className={classNames(td, 'hidden lg:table-cell')}>{timeAgo(s.at)}</td>
                  <td className={classNames(td, 'text-right')}>{s.upload && <Button size="sm" variant="link" onClick={() => void recheck(s.key, s.upload!.id)}>{t('Refresh')}<span className="sr-only"> {s.name}</span></Button>}</td>
                </tr>
              );
            })}
            {!session.length && <EmptyRow colSpan={6}>{t('No uploads yet in this tab.')} <Link className="font-semibold text-indigo-600" to="/admin/upload">{t('Open the Upload Center')}</Link></EmptyRow>}
          </TBody>
        </TableCard>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{t('Assets processing or failed')}</h2>
        {processing.isPending || failed.isPending ? <Loading /> : processing.isError || failed.isError ? <Alert tone="error">{errorMessage(processing.error ?? failed.error)}</Alert> : (
          <TableCard caption={t('Assets processing or failed')}>
            <thead>
              <tr>
                <th scope="col" className={thFirst}>{t('Asset')}</th>
                <th scope="col" className={th}>{t('Status')}</th>
                <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Problem')}</th>
                <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Updated')}</th>
              </tr>
            </thead>
            <TBody>
              {assets.map((a) => {
                const v = a.versions.find((x) => x.version === a.current_version);
                const bad = v?.checks.find((c) => !c.passed);
                return (
                  <tr key={a.id}>
                    <td className={tdFirst}><Link to={`/admin/assets/${a.id}`} className="hover:text-indigo-600">{a.title}</Link></td>
                    <td className={td}><StatusBadge status={a.status} /></td>
                    <td className={classNames(td, 'hidden whitespace-normal md:table-cell')}>{bad ? checkProblem(bad) : '—'}</td>
                    <td className={classNames(td, 'hidden sm:table-cell')}>{timeAgo(a.updated_at)}</td>
                  </tr>
                );
              })}
              {!assets.length && <EmptyRow colSpan={4}>{t('Nothing processing or failed.')}</EmptyRow>}
            </TBody>
          </TableCard>
        )}
      </section>
    </div>
  );
}
