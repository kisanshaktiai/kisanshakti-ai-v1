import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import mr from '@/i18n/locales/mr/chat-cards.json';
import { AdvisorCard, type AdvisorCardData } from '../AdvisorCard';

// The app merges every page bundle into the default namespace under its own key
// (src/i18n/config.ts), so the card must find its labels at `chatCards.cards.*` there.
const instance = i18n.createInstance();
beforeAll(async () => {
  await instance.use(initReactI18next).init({ lng: 'mr', resources: { mr: { translation: { ...mr } } }, interpolation: { escapeValue: false } });
});

const data: AdvisorCardData = {
  version: 1, language: 'mr', kind: 'ADVICE', greeting: 'g', das: 18,
  what_happened: 'w', why: 'y', how_to_fix: 'h', how_lines: ['one', 'two'], extras: [], products: [],
};

describe('AdvisorCard labels', () => {
  it('shows the section labels and the day count from the merged bundle, not the English fallback', () => {
    render(<I18nextProvider i18n={instance}><AdvisorCard data={{ ...data, crop: 'c' }} /></I18nextProvider>);
    const cards = (mr as { chatCards: { cards: Record<string, string> } }).chatCards.cards;
    expect(screen.getByText(cards.what)).toBeInTheDocument();
    expect(screen.getByText(cards.why)).toBeInTheDocument();
    expect(screen.getByText(cards.how)).toBeInTheDocument();
    expect(screen.queryByText('What')).toBeNull();
    expect(screen.getByText(new RegExp(cards.dayN.replace('{{count}}', '18')))).toBeInTheDocument();
  });

  it('numbers the how-to lines as steps', () => {
    render(<I18nextProvider i18n={instance}><AdvisorCard data={data} /></I18nextProvider>);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1');
    expect(items[1]).toHaveTextContent('two');
  });
});
