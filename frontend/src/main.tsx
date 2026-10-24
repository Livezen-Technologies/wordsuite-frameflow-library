import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import { config } from '@/core/config';
import { createQueryClient } from '@/app/queryClient';
import { Providers } from '@/app/Providers';
import { AppRoutes } from '@/app/AppRoutes';

const client = createQueryClient();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers client={client}>
      <BrowserRouter basename={config.basePath}>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  </StrictMode>,
);
