// Tailwind Plus Application UI · forms/form-layouts (01 stacked), input-groups, select-menus (native), textareas, checkboxes.
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { classNames } from '@/core/format';

export const inputClass =
  'block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 read-only:bg-gray-50 read-only:text-gray-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 aria-invalid:outline-red-400 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 dark:read-only:bg-white/5 dark:disabled:bg-white/5';

export const selectClass =
  'col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus-visible:outline-indigo-500';

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm/6 font-medium text-gray-900 dark:text-white">
      {children}
    </label>
  );
}

function Help({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error)
    return (
      <p id={id} className="mt-2 text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={id} className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {hint}
      </p>
    );
  return null;
}

interface FieldBase {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
}

export function TextField({ label, error, hint, className, id, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <Label htmlFor={fid}>{label}</Label>
      <div className="mt-2">
        <input id={fid} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-help` : undefined} className={inputClass} {...rest} />
      </div>
      <Help id={`${fid}-help`} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({ label, error, hint, className, id, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <Label htmlFor={fid}>{label}</Label>
      <div className="mt-2">
        <textarea id={fid} rows={3} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-help` : undefined} className={inputClass} {...rest} />
      </div>
      <Help id={`${fid}-help`} error={error} hint={hint} />
    </div>
  );
}

export function NativeSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={classNames('grid grid-cols-1', className)}>
      <select className={selectClass} {...rest}>
        {children}
      </select>
      <ChevronDownIcon aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400" />
    </div>
  );
}

export function SelectField({ label, error, hint, className, id, options, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <Label htmlFor={fid}>{label}</Label>
      <NativeSelect id={fid} className="mt-2" aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-help` : undefined} {...rest}>
        {options.map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </NativeSelect>
      <Help id={`${fid}-help`} error={error} hint={hint} />
    </div>
  );
}

export function Checkbox({ label, description, className, id, ...rest }: { label: ReactNode; description?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={classNames('flex gap-3', className)}>
      <div className="flex h-6 shrink-0 items-center">
        <div className="group grid size-4 grid-cols-1">
          <input
            id={fid}
            type="checkbox"
            aria-describedby={description ? `${fid}-d` : undefined}
            className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 forced-colors:appearance-auto"
            {...rest}
          />
          <CheckMark />
        </div>
      </div>
      <div className="text-sm/6">
        <label htmlFor={fid} className="font-medium text-gray-900 dark:text-white">
          {label}
        </label>
        {description && (
          <p id={`${fid}-d`} className="text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export function CheckMark() {
  return (
    <svg fill="none" viewBox="0 0 14 14" className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25">
      <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-has-checked:opacity-100" />
      <path d="M3 7H11" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-has-indeterminate:opacity-100" />
    </svg>
  );
}

/** Tailwind Plus Application UI · forms/toggles (04 with left label and description): a checkbox drawn as a switch. */
export function Toggle({ label, description, className, id, ...rest }: { label: ReactNode; description?: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={classNames('flex items-center justify-between gap-6', className)}>
      <span className="flex grow flex-col">
        <label htmlFor={fid} className="text-sm/6 font-medium text-gray-900 dark:text-white">
          {label}
        </label>
        {description && (
          <span id={`${fid}-d`} className="text-sm text-gray-500 dark:text-gray-400">
            {description}
          </span>
        )}
      </span>
      <div className="group relative inline-flex w-11 shrink-0 rounded-full bg-gray-200 p-0.5 inset-ring inset-ring-gray-900/5 outline-offset-2 outline-indigo-600 transition-colors duration-200 ease-in-out has-checked:bg-indigo-600 has-focus-visible:outline-2 has-disabled:opacity-50 dark:bg-white/5 dark:inset-ring-white/10 dark:outline-indigo-500 dark:has-checked:bg-indigo-500">
        <span className="size-5 rounded-full bg-white shadow-xs ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-5" />
        <input id={fid} type="checkbox" role="switch" aria-describedby={description ? `${fid}-d` : undefined} className="absolute inset-0 size-full appearance-none focus:outline-hidden disabled:cursor-not-allowed" {...rest} />
      </div>
    </div>
  );
}
