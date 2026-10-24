import type { ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { NotificationsProvider } from '@/components/ui/Notifications';
import { AuthProvider } from '@/hooks/useAuth';
import { I18nProvider } from '@/i18n';

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <I18nProvider>
          <NotificationsProvider>{children}</NotificationsProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
