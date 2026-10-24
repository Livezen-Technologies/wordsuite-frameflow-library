// Tailwind Plus Application UI · overlays/notifications (01 simple), as a global live region.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/20/solid';

interface Note {
  id: number;
  kind: 'success' | 'error';
  title: string;
  body?: string;
}
interface Ctx {
  notify: (title: string, body?: string) => void;
  fail: (title: string, body?: string) => void;
}
const NotifyContext = createContext<Ctx>({ notify: () => {}, fail: () => {} });
export const useNotify = () => useContext(NotifyContext);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setNotes((n) => n.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Note['kind'], title: string, body?: string) => {
      const id = ++seq.current;
      setNotes((n) => [...n.slice(-3), { id, kind, title, body }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );
  const value = useMemo<Ctx>(() => ({ notify: (t, b) => push('success', t, b), fail: (t, b) => push('error', t, b) }), [push]);
  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-[60] flex items-end px-4 py-6 sm:items-start sm:px-6 sm:pt-20 sm:pb-6">
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {notes.map((n) => (
            <Transition key={n.id} show appear>
              <div
                role={n.kind === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-gray-800 dark:-outline-offset-1 dark:outline-white/10"
              >
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="shrink-0">
                      {n.kind === 'error' ? <XCircleIcon aria-hidden="true" className="size-6 text-red-400" /> : <CheckCircleIcon aria-hidden="true" className="size-6 text-green-400" />}
                    </div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                      {n.body && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{n.body}</p>}
                    </div>
                    <div className="ml-4 flex shrink-0">
                      <button type="button" onClick={() => dismiss(n.id)} className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600 dark:hover:text-white dark:focus:outline-indigo-500">
                        <span className="sr-only">Close</span>
                        <XMarkIcon aria-hidden="true" className="size-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          ))}
        </div>
      </div>
    </NotifyContext.Provider>
  );
}
