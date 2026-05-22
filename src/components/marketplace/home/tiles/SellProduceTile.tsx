import { Store, ChevronRight, Lock } from 'lucide-react';

export function SellProduceTile({ onClick, locked }: { onClick: () => void; locked?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sell my produce"
      className="w-full text-left rounded-3xl p-4 min-h-[96px] flex items-center gap-4 transition-transform active:scale-[0.98] relative"
      style={{
        background:
          'linear-gradient(120deg, hsl(var(--market-accent)) 0%, hsl(95 25% 46%) 100%)',
        color: 'hsl(var(--market-accent-foreground))',
        boxShadow: '0 16px 30px -18px hsl(var(--market-accent) / 0.6)',
      }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'hsl(var(--market-accent-foreground) / 0.18)' }}
      >
        <Store className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
          अपनी उपज बेचें · Sell your produce
        </p>
        <p className="text-lg font-extrabold leading-tight">
          सीधे खरीदार से जुड़ें
        </p>
        <p className="text-[11px] opacity-90">List crops & reach buyers directly</p>
      </div>
      {locked ? (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold flex-shrink-0"
          style={{ backgroundColor: 'hsl(var(--market-warn))', color: 'hsl(var(--market-ink))' }}
        >
          <Lock className="w-3 h-3" /> PRO
        </span>
      ) : (
        <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-90" />
      )}
    </button>
  );
}
