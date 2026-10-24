/** Uploads checked in this browser tab (the API has no "list uploads" endpoint). Shared by Upload Center and Processing. */
import { useSyncExternalStore } from 'react';
import type { Upload } from '@/types/api';

export interface SessionUpload {
  key: string;
  name: string;
  size: number;
  upload: Upload | null;
  error: string | null;
  at: string;
}

let items: SessionUpload[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const uploadSession = {
  record(entry: SessionUpload) {
    items = [entry, ...items.filter((i) => i.key !== entry.key)].slice(0, 200);
    emit();
  },
  all: () => items,
  clear() {
    items = [];
    emit();
  },
};

export function useSessionUploads(): SessionUpload[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}
