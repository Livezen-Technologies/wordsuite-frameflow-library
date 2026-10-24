// Tailwind Plus Application UI · elements/buttons (primary, secondary, soft, danger).
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { classNames } from '@/core/format';
import { t } from '@/i18n';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'soft' | 'link';
type Size = 'sm' | 'md';

const base = 'inline-flex items-center justify-center gap-x-1.5 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const sizes: Record<Size, string> = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm' };
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-400',
  secondary: 'bg-white text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 focus-visible:outline-indigo-600 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20',
  danger: 'bg-white text-red-600 shadow-xs inset-ring inset-ring-red-200 hover:bg-red-50 focus-visible:outline-red-600 dark:bg-white/10 dark:text-red-400 dark:inset-ring-red-400/30 dark:hover:bg-red-500/10',
  success: 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-500 focus-visible:outline-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-400',
  soft: 'bg-indigo-50 text-indigo-600 shadow-xs hover:bg-indigo-100 focus-visible:outline-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 dark:shadow-none dark:hover:bg-indigo-500/30',
  link: 'text-indigo-600 hover:text-indigo-500 focus-visible:outline-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: Size = 'md', extra?: string): string {
  return classNames(base, variant === 'link' ? 'text-sm' : sizes[size], variants[variant], extra);
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: ButtonVariant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return (
    <svg className={classNames('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Loading({ label = t('Loading…') }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
      <Spinner />
      {label}
    </div>
  );
}
