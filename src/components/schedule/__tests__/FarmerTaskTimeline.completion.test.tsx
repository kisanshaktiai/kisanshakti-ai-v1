import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FarmerTaskTimeline from '../FarmerTaskTimeline';

// 2026-11-18: a past card (resources.timeline.state = HISTORICAL_UNCONFIRMED) showed only
// "स्थिती: pending" and no way to mark it done. These tests pin the wiring: the farmer can
// confirm it, with the day he did the work, through the verified completion operation.

const setTaskCompletion = vi.fn();
vi.mock('@/services/schedulesApi', () => ({ schedulesApi: { setTaskCompletion: (...a: unknown[]) => setTaskCompletion(...a) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('@/stores/languageStore', () => ({ useLanguageStore: () => ({ currentLanguage: 'en' }) }));
vi.mock('@/hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({ speak: vi.fn(), stop: vi.fn(), isSpeaking: false, isSupported: true, isVoicesLoaded: true, voiceUnavailable: false, openVoiceInstall: vi.fn(), canInstallVoice: false }),
}));
vi.mock('@/services/tts/providers/cloudProvider', () => ({ cloudProvider: { warmUp: vi.fn() } }));
vi.mock('../VideoHelpButton', () => ({ VideoHelpButton: () => null }));
vi.mock('../TaskEditDialog', () => ({ default: () => null }));
vi.mock('../ProductRecommendationCard', () => ({ default: () => null }));
vi.mock('@/lib/scheduleTaskPresentation', () => ({
  buildScheduleTaskPresentation: (task: { task_name: string }) => ({ what: task.task_name, how: ['step one'], howMuch: [], technicalDetails: [], needsTranslation: false }),
}));

const historical = {
  id: 'task-1', task_date: '2026-05-28', task_type: 'nutrition', task_name: 'Seed treatment',
  status: 'pending', priority: 'high', weather_dependent: false,
  resources: { timeline: { state: 'HISTORICAL_UNCONFIRMED', as_of: '2026-11-15' } },
};

describe('FarmerTaskTimeline — past card the farmer has not confirmed', () => {
  beforeEach(() => {
    setTaskCompletion.mockReset();
    // jsdom has no layout: the card-fit helper and scroll calls need these two browser APIs.
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the done tick and a translated "not confirmed" badge, never the raw status word', () => {
    render(<FarmerTaskTimeline tasks={[historical]} />);
    expect(screen.getByRole('button', { name: 'schedule.completion.mark_complete' })).toBeTruthy();
    expect(screen.getByText('schedule.completion.unconfirmed')).toBeTruthy();
    expect(screen.queryByText('schedule.completion.status')).toBeNull();
  });

  it('tapping the tick opens the card at the work-date question instead of saving today', () => {
    render(<FarmerTaskTimeline tasks={[historical]} />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule.completion.mark_complete' }));
    expect(setTaskCompletion).not.toHaveBeenCalled();
    const date = screen.getByLabelText('schedule.completion.work_date_label') as HTMLInputElement;
    expect(date.value).toBe('2026-05-28');
  });

  it('marking done sends the chosen past day (local noon), not today', async () => {
    setTaskCompletion.mockResolvedValue({ ...historical, status: 'completed', completed_at: '2026-06-02T06:30:00.000Z' });
    const onTaskUpdate = vi.fn();
    render(<FarmerTaskTimeline tasks={[historical]} onTaskUpdate={onTaskUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule.completion.mark_complete' }));
    fireEvent.change(screen.getByLabelText('schedule.completion.work_date_label'), { target: { value: '2026-06-02' } });
    fireEvent.click(screen.getByText('schedule.completion.mark_done'));
    await waitFor(() => expect(setTaskCompletion).toHaveBeenCalledTimes(1));
    const [taskId, completed, completedAt] = setTaskCompletion.mock.calls[0];
    expect(taskId).toBe('task-1');
    expect(completed).toBe(true);
    expect(completedAt).toBe(new Date('2026-06-02T12:00:00').toISOString());
  });

  it('a future day cannot be chosen', () => {
    render(<FarmerTaskTimeline tasks={[historical]} />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule.completion.mark_complete' }));
    const date = screen.getByLabelText('schedule.completion.work_date_label') as HTMLInputElement;
    fireEvent.change(date, { target: { value: '2999-01-01' } });
    expect(date.value).toBe(new Date().toLocaleDateString('en-CA'));
    expect(date.max).toBe(new Date().toLocaleDateString('en-CA'));
  });

  it('a confirmed past card shows as done and can be unmarked', () => {
    render(<FarmerTaskTimeline tasks={[{ ...historical, status: 'completed', completed_at: '2026-06-02T06:30:00.000Z' }]} />);
    expect(screen.getByRole('button', { name: 'schedule.completion.unmark' })).toBeTruthy();
    expect(screen.queryByText('schedule.completion.unconfirmed')).toBeNull();
  });

  it('a current card keeps the one-tap tick that saves now', async () => {
    setTaskCompletion.mockResolvedValue(null);
    const current = { ...historical, id: 'task-2', task_date: new Date().toLocaleDateString('en-CA'), resources: {} };
    render(<FarmerTaskTimeline tasks={[current]} />);
    fireEvent.click(screen.getByRole('button', { name: 'schedule.completion.mark_complete' }));
    await waitFor(() => expect(setTaskCompletion).toHaveBeenCalledTimes(1));
    const completedAt = setTaskCompletion.mock.calls[0][2] as string;
    expect(Math.abs(Date.parse(completedAt) - Date.now())).toBeLessThan(60_000);
  });
});
