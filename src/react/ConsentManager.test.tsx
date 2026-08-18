import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
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
    render(<ConsentManager config={config} />, {
      wrapper: React.StrictMode
    });
    expect(initConsent).toHaveBeenCalledTimes(1);
  });

  it('ne rend aucun DOM', () => {
    const { container } = render(<ConsentManager config={config} />);
    expect(container.innerHTML).toBe('');
  });
});
