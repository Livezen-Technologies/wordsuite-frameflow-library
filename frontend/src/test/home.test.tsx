import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { HomePage } from '@/pages/public/HomePage';
import { TYPE_KEYS, ASSET_TYPES } from '@/core/schema';
import { mockFetch, renderAt, Route } from './utils';
import { setToken } from '@/services/auth';

afterEach(() => vi.unstubAllGlobals());

describe('Home bento', () => {
  it('shows the live count per type from /catalog/types (a published LUT → 1 on the LUT card)', async () => {
    setToken(null);
    mockFetch({
      'GET /api/v1/catalog/types': () => ({ data: TYPE_KEYS.map((key) => ({ key, name: ASSET_TYPES[key].name, pack_type: key, editor_target: '', count: key === 'lut' ? 1 : 0 })) }),
      'GET /api/v1/collections': () => ({ data: [] }),
    });
    renderAt('/', <Route path="/" element={<HomePage />} />, { signedIn: false });
    expect(await screen.findByRole('link', { name: 'LUTs & Color Presets: 1 published' })).toBeInTheDocument();
    expect(screen.getByTestId('count-lut')).toHaveTextContent('1');
    expect(screen.getByTestId('count-font')).toHaveTextContent('0');
    expect(within(screen.getByRole('link', { name: /1 asset ready to install/ })).getByText(/1 asset ready/)).toBeInTheDocument();
  });
});
