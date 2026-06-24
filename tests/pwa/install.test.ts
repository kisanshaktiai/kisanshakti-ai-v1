/**
 * PWA Install Tests
 * 
 * Tests:
 * - beforeinstallprompt capture
 * - Banner show logic (engagement, cooldown)
 * - Install flow (accept/dismiss)
 * - Analytics tracking
 * - iOS instructions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PWAInstallBanner } from '@/components/PWAInstallBanner';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('PWAInstallBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should capture beforeinstallprompt event', async () => {
    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'android' })
    });

    window.dispatchEvent(mockEvent);

    // Banner should not show immediately (waits for engagement)
    expect(screen.queryByText(/Install KisanShakti/i)).not.toBeInTheDocument();
  });

  it('should show banner after user engagement', async () => {
    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'android' })
    });

    window.dispatchEvent(mockEvent);

    // Simulate user scroll (engagement)
    fireEvent.scroll(window);

    // Wait for banner to appear
    await waitFor(() => {
      expect(screen.getByText(/Install KisanShakti/i)).toBeInTheDocument();
    }, { timeout: 1000 });
  });

  it('should respect dismiss cooldown', () => {
    // Set dismissed timestamp to yesterday
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    localStorage.setItem('pwa_install_dismissed_at', yesterday.toString());
    localStorage.setItem('pwa_install_dismiss_count', '0');

    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'android' })
    });

    window.dispatchEvent(mockEvent);
    fireEvent.scroll(window);

    // Should show after 1 day cooldown (dismiss count = 0)
    waitFor(() => {
      expect(screen.getByText(/Install KisanShakti/i)).toBeInTheDocument();
    });
  });

  it('should not show if dismissed recently', () => {
    // Set dismissed timestamp to 1 hour ago
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    localStorage.setItem('pwa_install_dismissed_at', oneHourAgo.toString());
    localStorage.setItem('pwa_install_dismiss_count', '1');

    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    window.dispatchEvent(mockEvent);
    fireEvent.scroll(window);

    // Should not show (3 day cooldown for dismiss count = 1)
    expect(screen.queryByText(/Install KisanShakti/i)).not.toBeInTheDocument();
  });

  it('should handle install accept flow', async () => {
    const promptMock = vi.fn().mockResolvedValue(undefined);
    const userChoiceMock = Promise.resolve({ outcome: 'accepted', platform: 'android' });

    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: promptMock,
      userChoice: userChoiceMock,
      preventDefault: vi.fn()
    });

    window.dispatchEvent(mockEvent);
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByText(/Install KisanShakti/i)).toBeInTheDocument();
    });

    // Click install button
    const installButton = screen.getByRole('button', { name: /Install App/i });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalled();
    });
  });

  it('should handle install dismiss', async () => {
    render(<PWAInstallBanner />);

    const mockEvent = new Event('beforeinstallprompt');
    Object.assign(mockEvent, {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'android' })
    });

    window.dispatchEvent(mockEvent);
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByText(/Install KisanShakti/i)).toBeInTheDocument();
    });

    // Click dismiss button
    const dismissButton = screen.getByLabelText(/Dismiss/i);
    fireEvent.click(dismissButton);

    // Banner should hide
    await waitFor(() => {
      expect(screen.queryByText(/Install KisanShakti/i)).not.toBeInTheDocument();
    });

    // Check localStorage
    expect(localStorage.getItem('pwa_install_dismissed_at')).toBeTruthy();
    expect(localStorage.getItem('pwa_install_dismiss_count')).toBe('1');
  });

  it('should show iOS instructions on iOS Safari', async () => {
    // Mock iOS Safari user agent
    Object.defineProperty(window.navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    });

    render(<PWAInstallBanner />);

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByText(/Install on iPhone/i)).toBeInTheDocument();
    });

    // Click show instructions
    const instructionsButton = screen.getByRole('button', { name: /Show Instructions/i });
    fireEvent.click(instructionsButton);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Tap Share Button/i)).toBeInTheDocument();
      expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    });
  });

  it('should not show if already installed (standalone)', () => {
    // Mock standalone mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => {
        if (query === '(display-mode: standalone)') {
          return {
            matches: true,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
          };
        }
        return {
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        };
      }),
    });

    render(<PWAInstallBanner />);

    // Should not render anything
    expect(screen.queryByText(/Install KisanShakti/i)).not.toBeInTheDocument();
  });
});
