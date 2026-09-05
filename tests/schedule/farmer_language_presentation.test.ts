import { describe, expect, it } from 'vitest';
import { buildScheduleTaskPresentation } from '@/lib/scheduleTaskPresentation';

const mr = (key: string, fallback?: string) => ({
  'schedule.stages.irrigation': 'पाणी देणे',
  'schedule.stages.pest_control': 'कीड नियंत्रण',
  'schedule.stages.weeding': 'तण काढणे',
  'schedule.stages.sowing': 'पेरणी',
  'schedule.stages.harvest': 'कापणी',
  'schedule.task_card.description': 'काम',
  'schedule.task_card.quantity': 'किती लागेल',
  'schedule.amount.water': 'किती लागेल',
}[key] ?? fallback ?? key);

describe('farmer schedule presentation safety', () => {
  it('does not show raw English irrigation title/description when Marathi translation is unavailable', () => {
    const p = buildScheduleTaskPresentation({
      task_type: 'irrigation',
      task_name: 'Irrigation — booting',
      task_description: 'Irrigate about every 3 days from day 75 to day 89 after sowing.',
      language: null,
      instructions: [],
      resources: { quantity: '60 mm' },
    }, mr, 'mr');
    expect(p.what).toBe('पाणी देणे');
    expect(p.how).toEqual([]);
    expect(p.howMuch).toEqual([]);
  });

  it('never exposes stage water depth as a litres delivery quantity', () => {
    const p = buildScheduleTaskPresentation({
      task_type: 'irrigation',
      task_name: 'पाणी द्या',
      task_description: 'दर 3 दिवसांनी पाणी द्या.',
      language: 'mr',
      resources: { quantity: '60 mm' },
    }, mr, 'mr');
    expect(p.howMuch).toEqual([]);
  });

  it('accepts only an explicit litres field for irrigation quantity', () => {
    const p = buildScheduleTaskPresentation({
      task_type: 'irrigation',
      task_name: 'पाणी द्या',
      task_description: 'पाणी द्या.',
      language: 'mr',
      resources: { water_required_liters: 1200 },
    }, mr, 'mr');
    expect(p.howMuch).toEqual(['किती लागेल: 1200']);
  });
});
