import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders an accessible name and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and announced busy while loading', () => {
    render(<Button loading>Submitting</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('does not fire clicks when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Noop
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Noop' })).catch(() => undefined);
    expect(onClick).not.toHaveBeenCalled();
  });
});
