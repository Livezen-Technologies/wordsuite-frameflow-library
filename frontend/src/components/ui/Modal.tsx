// Tailwind Plus Application UI · overlays/modal-dialogs (03 simple alert) and overlays/drawers (05 with sticky footer).
import type { FormEvent, ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ExclamationTriangleIcon, QuestionMarkCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from './Button';
import { classNames } from '@/core/format';
import { t } from '@/i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  confirmDisabled?: boolean;
  /** Renders a form so Enter submits. */
  onConfirm: () => void;
}

export function Modal({ open, onClose, title, description, children, confirmLabel, tone = 'primary', busy, confirmDisabled, onConfirm }: ModalProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!confirmDisabled && !busy) onConfirm();
  };
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10"
          >
            <form onSubmit={submit}>
              <div className="sm:flex sm:items-start">
                <div className={classNames('mx-auto flex size-12 shrink-0 items-center justify-center rounded-full sm:mx-0 sm:size-10', tone === 'danger' ? 'bg-red-100 dark:bg-red-500/10' : 'bg-indigo-100 dark:bg-indigo-500/10')}>
                  {tone === 'danger' ? <ExclamationTriangleIcon aria-hidden="true" className="size-6 text-red-600 dark:text-red-400" /> : <QuestionMarkCircleIcon aria-hidden="true" className="size-6 text-indigo-600 dark:text-indigo-400" />}
                </div>
                <div className="mt-3 w-full text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">
                    {title}
                  </DialogTitle>
                  {description && <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</div>}
                  {children && <div className="mt-4 text-left">{children}</div>}
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="submit"
                  disabled={confirmDisabled || busy}
                  className={classNames(
                    'inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold text-white shadow-xs disabled:opacity-50 sm:ml-3 sm:w-auto',
                    tone === 'danger' ? 'bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400' : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
                  )}
                >
                  {busy ? t('Working…') : confirmLabel}
                </button>
                <button type="button" data-autofocus={children ? undefined : true} onClick={onClose} className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring-1 inset-ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20">
                  {t('Cancel')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

export function Drawer({ open, onClose, title, description, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/50 transition-opacity duration-500 data-closed:opacity-0 dark:bg-gray-900/50" />
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel transition className="pointer-events-auto w-screen max-w-md transform transition duration-500 ease-in-out data-closed:translate-x-full">
              <div className="relative flex h-full flex-col divide-y divide-gray-200 bg-white shadow-xl dark:divide-white/10 dark:bg-gray-800">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-6">
                  <div className="px-4 sm:px-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">{title}</DialogTitle>
                        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
                      </div>
                      <div className="ml-3 flex h-7 items-center">
                        <button type="button" onClick={onClose} className="relative rounded-md text-gray-400 hover:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:hover:text-white">
                          <span className="absolute -inset-2.5" />
                          <span className="sr-only">{t('Close panel')}</span>
                          <XMarkIcon aria-hidden="true" className="size-6" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-6 flex-1 px-4 sm:px-6">{children}</div>
                </div>
                {footer && <div className="flex shrink-0 justify-end gap-3 px-4 py-4">{footer}</div>}
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function SecondaryCancel({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      {t('Cancel')}
    </Button>
  );
}
