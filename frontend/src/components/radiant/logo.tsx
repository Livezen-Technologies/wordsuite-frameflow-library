// Replaces Radiant's logo (src/components/logo.tsx) with a FrameFlow mark + wordmark; keeps its hover motion pattern.
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true" className={className}>
      <rect x="1" y="5" width="32" height="24" rx="6" />
      <path d="M12 11h11v3.5h-7v2.5h6v3.5h-6V25h-4z" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <motion.span initial="idle" whileHover="active" variants={{ idle: {}, active: {} }} className={clsx(className, 'inline-flex items-center gap-2.5')} aria-label="FrameFlow">
      <motion.span variants={{ idle: { rotate: 0 }, active: { rotate: [0, -8, 0], transition: { duration: 0.5, ease: 'easeInOut' } } }} className="inline-flex">
        <Mark className="size-9 fill-gray-950" />
      </motion.span>
      <span aria-hidden="true" className="text-xl font-semibold tracking-tight text-gray-950">FrameFlow</span>
    </motion.span>
  );
}
