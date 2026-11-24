import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Landing from './Landing.jsx';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('Landing', () => {
  it('renders the hero, feature sections and login links', () => {
    renderLanding();

    expect(screen.getByText(/AP EAMCET 2027 Preparation/)).toBeTruthy();
    const hero = screen.getByRole('heading', { level: 1 });
    expect(hero.textContent).toContain('Master');
    expect(hero.textContent).toContain('Mathematics, Physics & Chemistry');
    expect(screen.getByText('Everything you need to crack your rank')).toBeTruthy();
    expect(screen.getByText('Three steps to better practice')).toBeTruthy();
    expect(screen.getAllByText('Daily challenge').length).toBeGreaterThan(0);
    expect(screen.getByText(/Built for focused, consistent practice/)).toBeTruthy();

    const loginLinks = [...document.querySelectorAll('a')].filter((node) => node.getAttribute('href') === '/login');
    expect(loginLinks.length).toBeGreaterThan(0);
    const start = screen.getByRole('link', { name: 'Start practising' });
    expect(start.getAttribute('href')).toBe('/login');
  });
});
