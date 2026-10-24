// Audit log (part of A12). Tailwind Plus: lists/tables (12 with condensed content), forms/input-groups (filter).
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { PageHeading } from '@/components/ui/Layout';
import { Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { inputClass } from '@/components/ui/Form';
import { TableCard, TBody, EmptyRow, th, td, thFirst } from '@/components/ui/Table';
import { formatDateTime } from '@/core/format';

export function AuditLog() {
  const q = useQuery({ queryKey: ['audit', 'all'], queryFn: () => adminApi.auditLog() });
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => (q.data ?? []).filter((e) => !filter || `${e.action} ${e.actor_role} ${e.entity} ${e.entity_id}`.toLowerCase().includes(filter.toLowerCase())), [q.data, filter]);
  return (
    <div className="space-y-6">
      <PageHeading title="Audit log" meta="Every change with before/after values (latest 200)" />
      <div className="max-w-sm">
        <label htmlFor="audit-filter" className="sr-only">Filter</label>
        <input id="audit-filter" type="search" placeholder="Filter by action, role, entity…" value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass} />
      </div>
      {q.isPending ? <Loading /> : q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : (
        <TableCard caption="Audit log">
          <thead>
            <tr>
              <th scope="col" className={thFirst}>When</th>
              <th scope="col" className={th}>Actor</th>
              <th scope="col" className={th}>Action</th>
              <th scope="col" className={th}>Entity</th>
              <th scope="col" className={th}>Change</th>
            </tr>
          </thead>
          <TBody>
            {rows.map((e, i) => (
              <tr key={e.id ?? i}>
                <td className="py-2 pr-3 pl-4 text-sm whitespace-nowrap text-gray-500 sm:pl-6 dark:text-gray-400"><time dateTime={e.at}>{formatDateTime(e.at)}</time></td>
                <td className={td}>{e.actor_role ?? 'system'}</td>
                <td className={`${td} font-mono text-xs`}>{e.action}</td>
                <td className={td}>{e.entity === 'asset' ? <Link className="text-indigo-600 dark:text-indigo-400" to={`/admin/assets/${e.entity_id}`}>asset</Link> : e.entity}</td>
                <td className={`${td} max-w-md truncate font-mono text-xs`} title={JSON.stringify(e.diff)}>{JSON.stringify(e.diff?.after)}</td>
              </tr>
            ))}
            {!rows.length && <EmptyRow colSpan={5}>No entries.</EmptyRow>}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
