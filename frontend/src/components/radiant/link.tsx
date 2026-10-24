// Ported from Tailwind Plus Radiant (src/components/link.tsx): next/link → react-router Link.
// External URLs (http…, mailto:) and in-page anchors render a plain <a>.
import * as Headless from '@headlessui/react';
import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router';

type Props = { href: string } & Omit<React.ComponentPropsWithoutRef<'a'>, 'href'>;

export const Link = forwardRef(function Link({ href, ...props }: Props, ref: React.ForwardedRef<HTMLAnchorElement>) {
  const external = /^(https?:|mailto:|#|\/feed\/|\/api\/)/.test(href);
  return <Headless.DataInteractive>{external ? <a ref={ref} href={href} {...props} /> : <RouterLink ref={ref} to={href} {...props} />}</Headless.DataInteractive>;
});
