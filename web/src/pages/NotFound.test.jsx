import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFound from './NotFound.jsx';

describe('NotFound', () => {
  it('renders the 404 message and navigation links', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.getByText(/That page does not exist or has moved/)).toBeTruthy();

    const dashboard = screen.getByRole('link', { name: 'Back to dashboard' });
    const home = screen.getByRole('link', { name: 'Go home' });
    expect(dashboard.getAttribute('href')).toBe('/app');
    expect(home.getAttribute('href')).toBe('/');
  });
});
