import { useEffect, useState } from 'react';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import type { AssetVersion } from '@/types/api';

export interface AdminPreviews {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** kind → object URL */
  urls: Record<string, string>;
  exts: Record<string, string>;
  error: string | null;
}

/**
 * Generated previews of any version, drafts included, through `GET /admin/assets/:id/versions/:v/previews/:file`
 * with the bearer token, as object URLs (revoked when the version changes or the component unmounts).
 */
export function useAdminPreviews(assetId: string, version: AssetVersion | undefined, enabled: boolean): AdminPreviews {
  const [state, setState] = useState<AdminPreviews>({ status: 'idle', urls: {}, exts: {}, error: null });
  const entries = Object.entries(version?.previews ?? {});
  const signature = enabled && version ? `${assetId}@${version.version}:${entries.map(([k, p]) => `${k}.${p.ext}`).join(',')}` : '';

  useEffect(() => {
    if (!signature || !version) {
      setState({ status: 'idle', urls: {}, exts: {}, error: null });
      return;
    }
    const ctrl = new AbortController();
    const made: string[] = [];
    const list = Object.entries(version.previews ?? {});
    setState({ status: 'loading', urls: {}, exts: {}, error: null });
    Promise.all(
      list.map(async ([kind, p]) => {
        const blob = await adminApi.previewBlob(assetId, version.version, `${kind}.${p.ext}`, ctrl.signal);
        const url = URL.createObjectURL(blob);
        made.push(url);
        return [kind, url, p.ext] as const;
      }),
    )
      .then((rows) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'ready', urls: Object.fromEntries(rows.map(([k, u]) => [k, u])), exts: Object.fromEntries(rows.map(([k, , e]) => [k, e])), error: null });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setState({ status: 'error', urls: {}, exts: {}, error: errorMessage(e) });
      });
    return () => {
      ctrl.abort();
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // `signature` captures everything that matters about `version`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return state;
}
