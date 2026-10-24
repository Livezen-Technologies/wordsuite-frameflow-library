// Generated previews from apps/workers (hover MP4, audio preview + waveform, specimen, before/after, poster, swatches).
// Shared by the admin editor and the public asset page; styling comes from the caller's tile class.
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { mediaUrl } from '@/core/config';

export type PreviewMap = Record<string, string>;

const LABELS: Record<string, string> = { thumbnail: 'Thumbnail', hover: 'Hover preview', audio_preview: 'Audio preview', waveform: 'Waveform', specimen: 'Font specimen', poster: 'Poster frame', swatches: 'Swatches' };
export const previewLabel = (kind: string) => LABELS[kind] ?? (/^before_after_(\d+)$/.test(kind) ? `Before / after ${kind.split('_').at(-1)}` : kind.replace(/_/g, ' '));

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
    <svg viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none" role="img" aria-label={`Waveform${q.data?.duration_ms ? `, ${(q.data.duration_ms / 1000).toFixed(1)} s` : ''}`} className={clsx('h-16 w-full', className)}>
      {bars.map((p, i) => (
        <rect key={i} x={i + 0.15} width={0.7} y={50 - Math.max(1, p * 50)} height={Math.max(2, p * 100)} className="fill-current" />
      ))}
    </svg>
  );
}

export function PreviewGallery({ previews, title, tileClassName, captionClassName }: { previews: PreviewMap; title: string; tileClassName: string; captionClassName: string }) {
  const kinds = orderedKinds(previews);
  if (!kinds.length) return null;
  return (
    <ul role="list" aria-label="Generated previews" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {kinds.map((k) => {
        const url = mediaUrl(previews[k])!;
        const wide = k === 'hover' || k === 'audio_preview' || k === 'specimen';
        return (
          <li key={k} className={clsx(wide && 'sm:col-span-2')}>
            <figure>
              {k === 'hover' || /\.(mp4|webm)$/.test(url) ? (
                <video src={url} muted loop playsInline controls preload="metadata" aria-label={`${title}: ${previewLabel(k)}`} className={clsx(tileClassName, 'aspect-video w-full bg-black object-contain')} />
              ) : k === 'audio_preview' || /\.mp3$/.test(url) ? (
                <div className={clsx(tileClassName, 'p-4')}>
                  {previews.waveform && <Waveform url={mediaUrl(previews.waveform)!} className="mb-3 text-current" />}
                  <audio src={url} controls preload="none" aria-label={`${title}: ${previewLabel(k)}`} className="w-full" />
                </div>
              ) : /\.json$/.test(url) ? (
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
