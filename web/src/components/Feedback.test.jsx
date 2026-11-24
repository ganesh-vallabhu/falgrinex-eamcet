import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, PageLoader, Spinner } from './Feedback.jsx';

describe('Feedback', () => {
  it('renders PageLoader with a label and spinner', () => {
    render(<PageLoader label="Loading quiz" />);

    expect(screen.getByText(/Loading quiz/)).toBeTruthy();
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
    expect(spinner.className).toContain('h-8 w-8');
  });

  it('renders the default PageLoader label', () => {
    render(<PageLoader />);

    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it('calls onRetry from ErrorState', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ErrorState title="Quiz unavailable" message="Quiz offline" onRetry={onRetry} />);

    expect(screen.getByText('Quiz unavailable')).toBeTruthy();
    expect(screen.getByText('Quiz offline')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when ErrorState has no callback', () => {
    render(<ErrorState message="Try later." />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Try later.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('renders the EmptyState action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <EmptyState
        title="No results"
        message="Check another subject."
        action={<button type="button" onClick={onAction}>Browse subjects</button>}
      />,
    );

    expect(screen.getByText('No results')).toBeTruthy();
    expect(screen.getByText('Check another subject.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Browse subjects' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders Spinner classes and hides it from assistive technology', () => {
    const { container, unmount } = render(<Spinner />);

    let spinner = container.firstChild;
    expect(spinner.tagName).toBe('SPAN');
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('h-5 w-5');
    unmount();

    const custom = render(<Spinner className="h-10 w-10" />);
    spinner = custom.container.firstChild;
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('h-10 w-10');
  });
});
