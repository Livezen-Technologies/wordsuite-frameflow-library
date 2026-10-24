import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Home } from '@/pages/site/Home';
import { TYPE_KEYS, ASSET_TYPES } from '@/core/schema';
import { mockFetch, renderAt, Route } from './utils';
import { setToken } from '@/services/auth';

afterEach(() => vi.unstubAllGlobals());

describe('Home', () => {
  it('shows the live total and per-type counts from /catalog/types, and trending from /collections', async () => {
    setToken(null);
    mockFetch({
      'GET /api/v1/catalog/types': () => ({ data: TYPE_KEYS.map((key) => ({ key, name: ASSET_TYPES[key].name, pack_type: key, editor_target: '', count: key === 'lut' ? 1 : key === 'font' ? 0 : 2 })) }),
      'GET /api/v1/collections': () => ({ data: [{ slug: 'trending', title: 'Trending', assets: [{ id: 'x', slug: 'neon', type: 'transition', title: 'Neon Glitch', licence_tier: 'pro', stats: { downloads: 18204 }, preview: {} }] }] }),
    });
    renderAt('/', <Route path="/" element={<Home />} />, { signedIn: false });
    expect(await screen.findByText('12 asset types · 21 assets · updated daily')).toBeInTheDocument();
    expect(screen.getByTestId('count-lut')).toHaveTextContent('1 assets');
    expect(screen.getByTestId('count-font')).toHaveTextContent('0 assets');
    expect(screen.getByRole('link', { name: /LUTs & colour presets/ })).toHaveAttribute('href', '/library/category/lut');
    expect((await screen.findAllByText('Neon Glitch')).length).toBeGreaterThan(0);
    expect(screen.getByText('18,204 downloads')).toBeInTheDocument();
  });

  it('degrades when the catalog API is down', async () => {
    setToken(null);
    mockFetch({});
    renderAt('/', <Route path="/" element={<Home />} />, { signedIn: false });
    expect(await screen.findByText(/Collections are unavailable right now/)).toBeInTheDocument();
    expect(screen.getByTestId('hero-counts')).toHaveTextContent('12 asset types · updated daily');
  });
});
