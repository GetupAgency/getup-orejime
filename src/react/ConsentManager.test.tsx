import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ConsentManager } from './ConsentManager';

const initConsent = vi.hoisted(() => vi.fn(async () => ({ isInert: false })));
vi.mock('../core/index', () => ({ initConsent }));

const config = {
  privacyPolicyUrl: '/c',
  purposes: [{ id: 'analytics', title: 'A', description: 'd', cookies: [], default: false as const }]
};

beforeEach(() => initConsent.mockClear());

describe('ConsentManager', () => {
  it('initialise le consentement au montage', () => {
    render(<ConsentManager config={config} />);
    expect(initConsent).toHaveBeenCalledWith(config);
  });

  it("n'initialise qu'une fois malgré un double montage React 18", () => {
    const { rerender } = render(<ConsentManager config={config} />);
    rerender(<ConsentManager config={config} />);
    expect(initConsent).toHaveBeenCalledTimes(1);
  });

  it('ne rend aucun DOM', () => {
    const { container } = render(<ConsentManager config={config} />);
    expect(container.innerHTML).toBe('');
  });
});
