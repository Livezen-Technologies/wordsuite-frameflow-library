// Devices (§7.1 device binding): list, revoke, plan limit, and what the DEVICE_LIMIT error means.
// Confirm dialog: Headless UI Dialog in Radiant's card style (rounded-3xl, ring-black/5, shadow-2xl).
import { useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountLayout, Notice } from './AccountLayout';
import { meApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { Button } from '@/components/radiant/button';
import { useNotify } from '@/components/ui/Notifications';
import { formatDateTime, timeAgo } from '@/core/format';
import { label } from '@/core/schema';
import { t } from '@/i18n';
import type { Device } from '@/types/api';

export function DevicesPage() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['me', 'devices'], queryFn: meApi.devices, retry: false });
  const [revoking, setRevoking] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const devices = q.data?.data ?? [];
  const limit = q.data?.limit;
  const full = limit != null && devices.length >= limit;

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await meApi.revokeDevice(revoking.id);
      notify(t('Device revoked'), revoking.name);
      setRevoking(null);
      await qc.invalidateQueries({ queryKey: ['me', 'devices'] });
    } catch (e) {
      fail(t('Couldn’t revoke the device'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccountLayout title={t('Devices')} lead={t('Computers where FrameFlow is signed in to your account. Downloads work only on these devices.')}>
      {q.isPending ? (
        <p role="status" className="text-sm/6 text-gray-600">{t('Loading…')}</p>
      ) : q.isError ? (
        <Notice tone="error" title={t('Couldn’t load your devices')} action={<Button variant="outline" onClick={() => void q.refetch()}>{t('Try again')}</Button>}>
          {errorMessage(q.error)}
        </Notice>
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {limit != null && (
              <div className="mb-6">
                <p className="text-sm/6 font-medium text-gray-950" role="status">{t('{n} of {limit} devices used', { n: devices.length, limit })}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 ring-1 ring-black/5" aria-hidden="true">
                  <div className={full ? 'h-full bg-fuchsia-800' : 'h-full bg-gray-950'} style={{ width: `${Math.min(100, (devices.length / Math.max(1, limit)) * 100)}%` }} />
                </div>
              </div>
            )}
            {!devices.length ? (
              <Notice title={t('No devices yet')}>{t('Sign in to FrameFlow on your computer and it appears here.')}</Notice>
            ) : (
              <ul role="list" className="divide-y divide-gray-100 rounded-3xl bg-white ring-1 ring-black/5">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 sm:px-6">
                    <ComputerDesktopIcon aria-hidden="true" className="size-8 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base/6 font-medium text-gray-950">{d.name || t('Unnamed device')}</p>
                      <p className="text-sm/6 text-gray-600">
                        {label(d.os)} · FrameFlow {d.app_version} · {t('last seen {when}', { when: timeAgo(d.last_seen_at) })}
                      </p>
                      <p className="text-xs/5 text-gray-500">{t('Added {date}', { date: formatDateTime(d.created_at) })}</p>
                    </div>
                    <Button variant="outline" onClick={() => setRevoking(d)}>
                      {t('Revoke')}<span className="sr-only"> {d.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside aria-labelledby="device-limit-h" className="self-start rounded-3xl bg-gray-50 p-6 ring-1 ring-black/5">
            <h2 id="device-limit-h" className="text-base/6 font-medium text-gray-950">{t('“Device limit reached”?')}</h2>
            <p className="mt-2 text-sm/6 text-gray-600">{t('Each plan can sign in FrameFlow on a set number of computers (Free 2, Pro 3, Business 10, Enterprise 50). When you sign in on one more, FrameFlow shows DEVICE_LIMIT and won’t download.')}</p>
            <p className="mt-2 text-sm/6 text-gray-600">{t('Revoke a computer you no longer use here, then sign in again in FrameFlow. Revoked devices can’t download until they sign in again.')}</p>
            {full && <p className="mt-4 rounded-xl bg-fuchsia-950/80 px-3 py-2 text-sm/6 font-medium text-white">{t('You’re at your limit: revoke a device before adding another.')}</p>}
          </aside>
        </div>
      )}

      <Dialog open={!!revoking} onClose={() => setRevoking(null)} className="radiant relative z-50">
        <DialogBackdrop transition className="fixed inset-0 bg-gray-950/25 transition-opacity data-closed:opacity-0" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel transition className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-black/5 transition data-closed:scale-95 data-closed:opacity-0">
            <DialogTitle className="text-lg/7 font-medium text-gray-950">{t('Revoke “{name}”?', { name: revoking?.name ?? '' })}</DialogTitle>
            <p className="mt-2 text-sm/6 text-gray-600">{t('FrameFlow on that computer stops downloading until you sign in there again. Installed assets keep working.')}</p>
            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setRevoking(null)}>{t('Cancel')}</Button>
              <Button disabled={busy} onClick={() => void revoke()}>{busy ? t('Working…') : t('Revoke device')}</Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </AccountLayout>
  );
}
