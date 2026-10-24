// A12 Webhooks. Tailwind Plus Application UI: lists/tables (03 simple in card), elements/badges, forms/toggles,
// forms/checkboxes (list with description), overlays/drawers (05 with sticky footer: create / edit, deliveries log),
// overlays/modal-dialogs (secret shown once, delete). API: GET/POST /admin/webhooks, PATCH/DELETE /admin/webhooks/:id,
// GET /admin/webhooks/:id/deliveries, POST /admin/webhooks/:id/test.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { ApiError, errorMessage } from '@/services/api';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Checkbox, TextField, Toggle } from '@/components/ui/Form';
import { Drawer, Modal } from '@/components/ui/Modal';
import { useNotify } from '@/components/ui/Notifications';
import { TableCard, TBody, EmptyRow, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { classNames, formatDateTime, timeAgo } from '@/core/format';
import { t } from '@/i18n';
import { WEBHOOK_EVENTS, type Webhook, type WebhookEvent } from '@/types/api';

/** https only, except localhost for development. */
export function webhookUrlProblem(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return null;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return null;
    return t('Use an https:// URL.');
  } catch {
    return t('Enter a full URL, e.g. https://example.com/hooks/library.');
  }
}

type FormState = { url: string; events: WebhookEvent[]; active: boolean };

export function Webhooks() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['webhooks'], queryFn: adminApi.webhooks, retry: false });
  const [editing, setEditing] = useState<Webhook | 'new' | null>(null);
  const [form, setForm] = useState<FormState>({ url: '', events: [...WEBHOOK_EVENTS], active: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [logFor, setLogFor] = useState<Webhook | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] });

  const open = (w: Webhook | 'new') => {
    setFormError(null);
    setForm(w === 'new' ? { url: '', events: [...WEBHOOK_EVENTS], active: true } : { url: w.url, events: w.events, active: w.active });
    setEditing(w);
  };

  const submit = async () => {
    const problem = webhookUrlProblem(form.url.trim());
    if (problem) return setFormError(problem);
    if (!form.events.length) return setFormError(t('Pick at least one event.'));
    setBusy('form');
    setFormError(null);
    try {
      const body = { url: form.url.trim(), events: form.events, active: form.active };
      if (editing === 'new') {
        const created = await adminApi.createWebhook(body);
        if (created?.secret) setSecret({ url: created.url, secret: created.secret });
        notify(t('Webhook added'), body.url);
      } else if (editing) {
        await adminApi.updateWebhook(editing.id, body);
        notify(t('Webhook saved'), body.url);
      }
      setEditing(null);
      void refresh();
    } catch (e) {
      setFormError(e instanceof ApiError ? errorMessage(e) : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (w: Webhook) => {
    setBusy(w.id);
    try {
      await adminApi.updateWebhook(w.id, { active: !w.active });
      void refresh();
    } catch (e) {
      fail(t('Couldn’t update the webhook'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async (w: Webhook) => {
    setBusy(`test-${w.id}`);
    try {
      await adminApi.testWebhook(w.id);
      notify(t('Test event sent'), t('A ping event is on its way to {url}.', { url: w.url }));
      void qc.invalidateQueries({ queryKey: ['webhook-deliveries', w.id] });
    } catch (e) {
      fail(t('Couldn’t send the test event'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy('delete');
    try {
      await adminApi.deleteWebhook(deleting.id);
      notify(t('Webhook deleted'), deleting.url);
      setDeleting(null);
      void refresh();
    } catch (e) {
      fail(t('Couldn’t delete the webhook'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('Signed with X-Library-Signature: sha256=HMAC(secret, body). Three attempts with backoff.')}</p>
        <Button variant="soft" onClick={() => open('new')}>{t('Add webhook')}</Button>
      </div>
      {q.isPending ? <Loading /> : q.isError ? (
        <Alert tone="error" title={t('Couldn’t load webhooks')}>{errorMessage(q.error)}</Alert>
      ) : (
        <TableCard caption={t('Webhooks')}>
          <thead>
            <tr>
              <th scope="col" className={thFirst}>{t('Endpoint')}</th>
              <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Events')}</th>
              <th scope="col" className={th}>{t('Status')}</th>
              <th scope="col" className={th}><span className="sr-only">{t('Actions')}</span></th>
            </tr>
          </thead>
          <TBody>
            {q.data.map((w) => (
              <tr key={w.id}>
                <td className={classNames(tdFirst, 'max-w-xs truncate font-mono text-xs')} title={w.url}>{w.url}</td>
                <td className={classNames(td, 'hidden whitespace-normal md:table-cell')}>
                  <span className="flex flex-wrap gap-1">{w.events.map((e) => <Badge key={e} tone="gray">{e}</Badge>)}</span>
                </td>
                <td className={td}>
                  <button type="button" role="switch" aria-checked={w.active} disabled={busy === w.id} onClick={() => void toggleActive(w)} aria-label={t('Active: {url}', { url: w.url })} className={classNames('group relative inline-flex w-11 shrink-0 rounded-full p-0.5 inset-ring inset-ring-gray-900/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50', w.active ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-200 dark:bg-white/5')}>
                    <span className={classNames('size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform', w.active && 'translate-x-5')} />
                  </button>
                </td>
                <td className={classNames(td, 'text-right')}>
                  <div className="flex justify-end gap-3">
                    <Button variant="link" loading={busy === `test-${w.id}`} onClick={() => void test(w)}>{t('Test')}<span className="sr-only"> {w.url}</span></Button>
                    <Button variant="link" onClick={() => setLogFor(w)}>{t('Deliveries')}<span className="sr-only"> {w.url}</span></Button>
                    <Button variant="link" onClick={() => open(w)}>{t('Edit')}<span className="sr-only"> {w.url}</span></Button>
                    <Button variant="link" className="text-red-600! dark:text-red-400!" onClick={() => setDeleting(w)}>{t('Delete')}<span className="sr-only"> {w.url}</span></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!q.data.length && <EmptyRow colSpan={4}>{t('No webhooks. Add one to tell other systems when assets are published or updated.')}</EmptyRow>}
          </TBody>
        </TableCard>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Add webhook') : t('Edit webhook')}
        description={t('The Library POSTs JSON to this URL when the chosen events happen.')}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>{t('Cancel')}</Button><Button loading={busy === 'form'} onClick={() => void submit()}>{editing === 'new' ? t('Add webhook') : t('Save')}</Button></>}
      >
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <TextField label={t('Payload URL')} type="url" placeholder="https://example.com/hooks/library" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
          <fieldset>
            <legend className="text-sm/6 font-medium text-gray-900 dark:text-white">{t('Events')}</legend>
            <div className="mt-3 space-y-3">
              {WEBHOOK_EVENTS.map((ev) => (
                <Checkbox key={ev} label={<span className="font-mono text-xs">{ev}</span>} checked={form.events.includes(ev)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev] : form.events.filter((x) => x !== ev) })} />
              ))}
            </div>
          </fieldset>
          <Toggle label={t('Active')} description={t('Inactive webhooks keep their settings but receive nothing.')} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          {formError && <Alert tone="error">{formError}</Alert>}
          <button type="submit" className="sr-only">{t('Save')}</button>
        </form>
      </Drawer>

      <Modal open={!!secret} onClose={() => setSecret(null)} title={t('Copy the signing secret now')} description={t('This is the only time it’s shown. Use it to check X-Library-Signature on {url}.', { url: secret?.url ?? '' })} confirmLabel={t('I’ve saved it')} onConfirm={() => { setSecret(null); setCopied(false); }}>
        <div className="flex items-center gap-2">
          <code aria-label={t('Signing secret')} className="min-w-0 flex-1 rounded-md bg-gray-50 px-3 py-2 font-mono text-xs break-all text-gray-900 outline-1 outline-gray-200 dark:bg-white/5 dark:text-gray-100 dark:outline-white/10">{secret?.secret}</code>
          <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(secret?.secret ?? '').then(() => setCopied(true))}>{copied ? t('Copied') : t('Copy')}</Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} tone="danger" title={t('Delete this webhook?')} description={deleting?.url} confirmLabel={t('Delete')} busy={busy === 'delete'} onConfirm={() => void remove()} />

      <Deliveries hook={logFor} onClose={() => setLogFor(null)} />
    </div>
  );
}

function Deliveries({ hook, onClose }: { hook: Webhook | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['webhook-deliveries', hook?.id], queryFn: () => adminApi.webhookDeliveries(hook!.id), enabled: !!hook, retry: false });
  return (
    <Drawer open={!!hook} onClose={onClose} title={t('Deliveries')} description={hook ? t('Last 50 deliveries to {url}', { url: hook.url }) : undefined}>
      {q.isPending ? <Loading /> : q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : (
        <ul role="list" aria-label={t('Deliveries')} className="divide-y divide-gray-100 text-sm dark:divide-white/5">
          {q.data.map((d) => (
            <li key={d.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-gray-900 dark:text-white">{d.event}</span>
                <Badge tone={d.ok ? 'green' : 'red'}>{d.status_code ?? t('no response')}</Badge>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                <time dateTime={d.created_at} title={formatDateTime(d.created_at)}>{timeAgo(d.created_at)}</time> · {t('attempt {n}', { n: d.attempt })}
              </p>
              {d.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{d.error}</p>}
            </li>
          ))}
          {!q.data.length && <li className="py-3 text-gray-500 dark:text-gray-400">{t('No deliveries yet. Use Test to send a ping.')}</li>}
        </ul>
      )}
    </Drawer>
  );
}
