#!/usr/bin/env node
/**
 * Codemod: map hardcoded Tailwind palette classes → semantic tenant-theme tokens.
 *
 * Mapping rules (utility-aware):
 *   red/rose                        → destructive  (soft for 50/100, /30 border for 200–400)
 *   green/emerald/lime/teal         → success
 *   amber/yellow/orange             → warning
 *   blue/sky/cyan/indigo            → info
 *   purple/violet/fuchsia/pink      → primary     (treated as brand accents)
 *   gray/slate/zinc/neutral/stone   → muted / muted-foreground / border
 *
 * Usage:  node scripts/codemod-theme-colors.mjs [file ...]
 *         (no args = run on the top-offender list)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const STATUS_GROUPS = {
  destructive: ['red', 'rose'],
  success:     ['green', 'emerald', 'lime', 'teal'],
  warning:     ['amber', 'yellow', 'orange'],
  info:        ['blue', 'sky', 'cyan', 'indigo'],
  primary:     ['purple', 'violet', 'fuchsia', 'pink'],
};
const NEUTRALS = ['gray', 'slate', 'zinc', 'neutral', 'stone'];

const TARGET_FILES = [
  'src/components/schedule/ModernTaskCard.tsx',
  'src/components/schedule/ProductRecommendationCard.tsx',
  'src/components/chat/RecommendationCards.tsx',
  'src/components/chat/ProductCard.tsx',
  'src/components/chat/EnhancedColorCodedCard.tsx',
  'src/components/chat/LandSpecificChatTab.tsx',
  'src/components/schedule/CropScheduleView.tsx',
  'src/pages/Weather.tsx',
  'src/components/schedule/TaskTimeline.tsx',
  'src/components/chat/DiagnosticResponseCard.tsx',
  'src/components/proactive/AlertEvidenceSection.tsx',
  'src/components/weather/SevenDayForecast.tsx',
  'src/components/schedule/MultiIntercropSelector.tsx',
  'src/components/schedule/ScheduleGenerator.tsx',
  'src/components/chat/LandContextCard.tsx',
  'src/components/chat/SuggestionTypeSelector.tsx',
  'src/components/schedule/TaskPhotoUploadDialog.tsx',
  'src/components/chat/FollowUpQuestions.tsx',
  'src/components/schedule/BackdatedConsentDialog.tsx',
  'src/components/weather/FarmingRecommendations.tsx',
  'src/components/chat/CanonicalAdvisoryCard.tsx',
  'src/components/schedule/FarmingTypeDialog.tsx',
  'src/components/chat/FarmerMessageCard.tsx',
  'src/components/schedule/IntercropSelector.tsx',
  'src/components/schedule/ClimateAlertBanner.tsx',
];

/** Pick the semantic token + opacity suffix for a (utility, palette, shade) combo. */
function mapToken(util, palette, shade) {
  shade = parseInt(shade, 10);

  // Neutrals → muted
  if (NEUTRALS.includes(palette)) {
    if (util === 'text') {
      if (shade <= 400) return 'text-muted-foreground';
      if (shade <= 700) return 'text-foreground/80';
      return 'text-foreground';
    }
    if (util === 'bg') {
      if (shade <= 100) return 'bg-muted';
      if (shade <= 300) return 'bg-muted';
      if (shade <= 600) return 'bg-muted-foreground/40';
      return 'bg-foreground/80';
    }
    if (util === 'border') return shade <= 300 ? 'border-border' : 'border-border';
    if (util === 'divide') return 'divide-border';
    if (util === 'placeholder') return 'placeholder:text-muted-foreground';
    if (util === 'ring') return 'ring-border';
    return null;
  }

  // Map color → semantic group
  let group = null;
  for (const [g, list] of Object.entries(STATUS_GROUPS)) {
    if (list.includes(palette)) { group = g; break; }
  }
  if (!group) return null;

  // bg: 50/100 → -soft; 200/300 → /20 of color; 400+ → full color
  if (util === 'bg') {
    if (shade <= 100) return `bg-${group}-soft`;
    if (shade <= 300) return `bg-${group}/20`;
    return `bg-${group}`;
  }
  // text: light shades (≤400) only on dark surfaces — use group color anyway
  if (util === 'text') return `text-${group}`;
  // border: light shades softer
  if (util === 'border') {
    if (shade <= 200) return `border-${group}/30`;
    if (shade <= 400) return `border-${group}/50`;
    return `border-${group}`;
  }
  if (util === 'ring')   return `ring-${group}`;
  if (util === 'fill')   return `fill-${group}`;
  if (util === 'stroke') return `stroke-${group}`;
  if (util === 'from')   return `from-${group}`;
  if (util === 'to')     return `to-${group}`;
  if (util === 'via')    return `via-${group}`;
  if (util === 'divide') return `divide-${group}`;
  if (util === 'shadow') return `shadow-${group}/30`;
  if (util === 'accent') return `accent-${group}`;
  if (util === 'caret')  return `caret-${group}`;
  if (util === 'decoration') return `decoration-${group}`;
  if (util === 'outline') return `outline-${group}`;
  if (util === 'placeholder') return `placeholder:text-${group}`;
  return null;
}

const ALL_PALETTES = [
  ...Object.values(STATUS_GROUPS).flat(),
  ...NEUTRALS,
];
const UTILITIES = ['text','bg','border','from','to','via','ring','fill','stroke','shadow','divide','placeholder','caret','accent','decoration','outline'];

// Match optional variant prefix (e.g. "hover:", "dark:", "md:", "group-hover:")
// Then capture utility-palette-shade.
const RX = new RegExp(
  `\\b((?:[a-z-]+:)*)(${UTILITIES.join('|')})-(${ALL_PALETTES.join('|')})-([0-9]{2,3})\\b`,
  'g'
);

function migrate(file) {
  const src = readFileSync(file, 'utf8');
  let count = 0;
  const out = src.replace(RX, (match, prefix, util, palette, shade) => {
    const tok = mapToken(util, palette, shade);
    if (!tok) return match;
    count++;
    return prefix + tok;
  });
  if (count > 0) {
    writeFileSync(file, out);
    console.log(`  ${String(count).padStart(4)}  ${file}`);
  }
  return count;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : TARGET_FILES;
console.log(`Codemod: migrating ${files.length} files…\n`);
let total = 0;
for (const f of files) {
  try { total += migrate(f); }
  catch (e) { console.error(`  !!  ${f}: ${e.message}`); }
}
console.log(`\nTotal replacements: ${total}`);
