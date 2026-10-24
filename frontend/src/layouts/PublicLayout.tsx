import { Outlet } from 'react-router';
import { Footer } from '@/components/radiant/footer';

/** Public site shell (Tailwind Plus Radiant). The `.radiant` scope carries its font and light theme. */
export function PublicLayout() {
  return (
    <div className="radiant min-h-full overflow-hidden">
      <Outlet />
      <Footer />
    </div>
  );
}

/** Radiant's standard page top: soft gradient + navbar (pricing/blog pages). */
export { GradientBackground } from '@/components/radiant/gradient';
