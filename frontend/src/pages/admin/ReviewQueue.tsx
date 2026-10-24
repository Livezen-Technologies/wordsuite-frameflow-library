// A6 Review Queue. Tailwind Plus: lists/stacked-lists (with actions), feedback/empty-states (01), overlays/modal-dialogs (reject reason).
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { PageHeading, EmptyState, TypeTile } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge, TierBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TextArea } from '@/components/ui/Form';
import { useNotify } from '@/components/ui/Notifications';
import { checkProblem } from '@/components/Checks';
import { typeColor, typeName } from '@/core/schema';
import { timeAgo } from '@/core/format';
import type { Asset } from '@/types/api';
import { t, tn } from '@/i18n';

export function ReviewQueue() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['assets', { status: 'ready_for_review' }], queryFn: () => adminApi.listAssets({ status: 'ready_for_review' }) });
  const [rejecting, setRejecting] = useState<Asset | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (a: Asset, approve: boolean) => {
    setBusy(a.id);
    try {
      if (approve) await adminApi.approve(a.id);
      else await adminApi.reject(a.id, reason);
      notify(approve ? t('Approved') : t('Rejected'), a.title);
      setRejecting(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    } catch (e) {
      fail(t('That didn’t work'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading title={t('Review Queue')} meta={q.data ? t('{n} waiting', { n: q.data.total }) : undefined} />
      {q.isPending ? <Loading /> : q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : !q.data.data.length ? (
        <div className="rounded-lg bg-white shadow-sm dark:bg-gray-800/50"><EmptyState icon={<ClipboardDocumentCheckIcon />} title={t('Nothing waiting for review')}>{t('Drafts submitted for review show up here.')}</EmptyState></div>
      ) : (
        <ul role="list" className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white shadow-sm outline-1 outline-black/5 dark:divide-white/5 dark:bg-gray-800/50 dark:outline-white/10">
          {q.data.data.map((a) => {
            const v = a.versions.find((x) => x.version === a.current_version);
            const failed = v?.checks.filter((c) => !c.passed) ?? [];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 sm:px-6">
                <TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="size-12" />
                <div className="min-w-0 flex-auto">
                  <p className="text-sm/6 font-semibold text-gray-900 dark:text-white"><Link to={`/admin/assets/${a.id}`} className="hover:underline">{a.title}</Link></p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs/5 text-gray-500 dark:text-gray-400">
                    <span>{typeName(a.type)}</span><span aria-hidden="true">·</span><span className="font-mono">v{a.current_version}</span><span aria-hidden="true">·</span><TierBadge tier={a.licence_tier} /><span aria-hidden="true">·</span>
                    {failed.length ? <Badge tone="red">{tn('{n} check failed: {problem}', '{n} checks failed: {problem}', failed.length, { problem: checkProblem(failed[0]) })}</Badge> : <Badge tone="green">{t('all checks passed')}</Badge>}
                    <span aria-hidden="true">·</span><span>{a.thumbnail_file ? t('thumbnail') : t('no thumbnail')}</span><span aria-hidden="true">·</span><time dateTime={a.updated_at}>{timeAgo(a.updated_at)}</time>
                  </p>
                </div>
                <div className="flex flex-none items-center gap-3">
                  <Button variant="success" size="sm" loading={busy === a.id} onClick={() => void act(a, true)}>{t('Approve')}<span className="sr-only"> {a.title}</span></Button>
                  <Button variant="danger" size="sm" onClick={() => setRejecting(a)}>{t('Reject…')}<span className="sr-only"> {a.title}</span></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={t('{action} “{title}”?', { action: t('Reject'), title: rejecting?.title ?? '' })} description={t('It goes back to draft with your reason.')} tone="danger" confirmLabel={t('Reject')} busy={!!busy} confirmDisabled={!reason.trim()} onConfirm={() => rejecting && void act(rejecting, false)}>
        <TextArea label={t('Reason')} required value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Modal>
    </div>
  );
}
