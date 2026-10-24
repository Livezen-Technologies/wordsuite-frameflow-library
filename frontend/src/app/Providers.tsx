import type { ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { NotificationsProvider } from '@/components/ui/Notifications';
import { AuthProvider } from '@/hooks/useAuth';

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NotificationsProvider>
        <AuthProvider>{children}</AuthProvider>
      </NotificationsProvider>
    </QueryClientProvider>
  );
}
