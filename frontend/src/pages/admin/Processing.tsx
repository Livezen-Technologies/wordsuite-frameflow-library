// A7 Processing (checks view). Tailwind Plus: lists/tables (03), elements/badges, feedback/alerts.
// The API has no jobs endpoint: this shows uploads checked in this tab (GET /admin/uploads/:id refreshes one)
// plus assets whose status is processing or failed.
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { useSessionUploads, uploadSession } from '@/services/uploadSession';
import { PageHeading } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { TableCard, TBody, EmptyRow, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { checkProblem, checksPassed } from '@/components/Checks';
import { typeName } from '@/core/schema';
import { classNames, formatBytes, timeAgo } from '@/core/format';

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
      <PageHeading title="Processing" meta="Upload checks and assets that are processing or failed" />
      <Alert tone="info" title="Live job list and retry aren’t available yet">
        The Library API runs checks synchronously on upload and has no jobs endpoint (blueprint A7: <code>GET /admin/jobs</code>, <code>POST /admin/jobs/:id/retry</code>). To retry, upload the file again or upload a new version.
      </Alert>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Uploads this session</h2>
          {session.length > 0 && <Button size="sm" variant="secondary" onClick={() => uploadSession.clear()}>Clear</Button>}
        </div>
        <TableCard caption="Uploads checked in this session">
          <thead>
            <tr>
              <th scope="col" className={thFirst}>File</th>
              <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>Type</th>
              <th scope="col" className={th}>Result</th>
              <th scope="col" className={classNames(th, 'hidden md:table-cell')}>Checks</th>
              <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>When</th>
              <th scope="col" className={th}><span className="sr-only">Actions</span></th>
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
                    {s.error ? <Badge tone="red">{s.error}</Badge> : s.upload && checksPassed(s.upload.checks) ? <Badge tone="green">valid</Badge> : <Badge tone="red">blocked · {failedChecks[0] ? checkProblem(failedChecks[0]) : '—'}</Badge>}
                  </td>
                  <td className={classNames(td, 'hidden md:table-cell')}>{s.upload ? `${s.upload.checks.filter((c) => c.passed).length}/${s.upload.checks.length} passed` : '—'}</td>
                  <td className={classNames(td, 'hidden lg:table-cell')}>{timeAgo(s.at)}</td>
                  <td className={classNames(td, 'text-right')}>{s.upload && <Button size="sm" variant="link" onClick={() => void recheck(s.key, s.upload!.id)}>Refresh<span className="sr-only"> {s.name}</span></Button>}</td>
                </tr>
              );
            })}
            {!session.length && <EmptyRow colSpan={6}>No uploads yet in this tab. <Link className="font-semibold text-indigo-600" to="/admin/upload">Open the Upload Center</Link></EmptyRow>}
          </TBody>
        </TableCard>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Assets processing or failed</h2>
        {processing.isPending || failed.isPending ? <Loading /> : processing.isError || failed.isError ? <Alert tone="error">{errorMessage(processing.error ?? failed.error)}</Alert> : (
          <TableCard caption="Assets processing or failed">
            <thead>
              <tr>
                <th scope="col" className={thFirst}>Asset</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={classNames(th, 'hidden md:table-cell')}>Problem</th>
                <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>Updated</th>
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
              {!assets.length && <EmptyRow colSpan={4}>Nothing processing or failed.</EmptyRow>}
            </TBody>
          </TableCard>
        )}
      </section>
    </div>
  );
}
