// Generated previews from apps/workers (hover MP4, audio preview + waveform, specimen, before/after, poster, swatches).
// Shared by the admin editor and the public asset page; styling comes from the caller's tile class.
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { mediaUrl } from '@/core/config';
import { msg, t, type MessageKey } from '@/i18n';

export type PreviewMap = Record<string, string>;

const LABELS: Record<string, MessageKey> = { thumbnail: msg('Thumbnail'), hover: msg('Hover preview'), audio_preview: msg('Audio preview'), waveform: msg('Waveform'), specimen: msg('Font specimen'), poster: msg('Poster frame'), swatches: msg('Swatches') };
export const previewLabel = (kind: string) => (LABELS[kind] ? t(LABELS[kind]) : /^before_after_(\d+)$/.test(kind) ? t('Before / after {n}', { n: kind.split('_').at(-1)! }) : kind.replace(/_/g, ' '));

/** Display order: the media people look at first. */
export function orderedKinds(map: PreviewMap): string[] {
  const rank = (k: string) => ['hover', 'audio_preview', 'specimen', 'poster', 'swatches', 'thumbnail'].indexOf(k.replace(/^before_after_\d+$/, 'poster'));
  return Object.keys(map)
    .filter((k) => k !== 'waveform')
    .sort((a, b) => (rank(a) === -1 ? 99 : rank(a)) - (rank(b) === -1 ? 99 : rank(b)) || a.localeCompare(b));
}

export function Waveform({ url, className }: { url: string; className?: string }) {
  const q = useQuery({ queryKey: ['waveform', url], queryFn: async () => (await (await fetch(url)).json()) as { peaks: number[]; duration_ms?: number }, staleTime: Infinity, retry: false });
  const peaks = q.data?.peaks ?? [];
  if (!peaks.length) return null;
  const step = Math.max(1, Math.floor(peaks.length / 200));
  const bars = peaks.filter((_, i) => i % step === 0);
  return (
    <svg viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none" role="img" aria-label={q.data?.duration_ms ? t('Waveform, {s} s', { s: (q.data.duration_ms / 1000).toFixed(1) }) : t('Waveform')} className={clsx('h-16 w-full', className)}>
      {bars.map((p, i) => (
        <rect key={i} x={i + 0.15} width={0.7} y={50 - Math.max(1, p * 50)} height={Math.max(2, p * 100)} className="fill-current" />
      ))}
    </svg>
  );
}

/** `exts` gives each kind's file extension when the URLs don't carry one (object URLs of authenticated previews). */
export function PreviewGallery({ previews, title, tileClassName, captionClassName, exts }: { previews: PreviewMap; title: string; tileClassName: string; captionClassName: string; exts?: Record<string, string> }) {
  const kinds = orderedKinds(previews);
  if (!kinds.length) return null;
  return (
    <ul role="list" aria-label={t('Generated previews')} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {kinds.map((k) => {
        const url = mediaUrl(previews[k])!;
        const ext = exts?.[k] ?? /\.([a-z0-9]+)$/i.exec(url)?.[1] ?? '';
        const wide = k === 'hover' || k === 'audio_preview' || k === 'specimen';
        return (
          <li key={k} className={clsx(wide && 'sm:col-span-2')}>
            <figure>
              {k === 'hover' || /^(mp4|webm)$/.test(ext) ? (
                <video src={url} muted loop playsInline controls preload="metadata" aria-label={`${title}: ${previewLabel(k)}`} className={clsx(tileClassName, 'aspect-video w-full bg-black object-contain')} />
              ) : k === 'audio_preview' || ext === 'mp3' ? (
                <div className={clsx(tileClassName, 'p-4')}>
                  {previews.waveform && <Waveform url={mediaUrl(previews.waveform)!} className="mb-3 text-current" />}
                  <audio src={url} controls preload="none" aria-label={`${title}: ${previewLabel(k)}`} className="w-full" />
                </div>
              ) : ext === 'json' ? (
                <a href={url} className={clsx(tileClassName, 'block p-4 text-sm underline')}>{previewLabel(k)} (JSON)</a>
              ) : (
                <img src={url} alt={`${title}: ${previewLabel(k)}`} loading="lazy" className={clsx(tileClassName, 'w-full object-contain', k === 'specimen' ? 'bg-white' : k === 'thumbnail' || k === 'poster' ? 'aspect-video' : '')} />
              )}
              <figcaption className={captionClassName}>{previewLabel(k)}</figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
