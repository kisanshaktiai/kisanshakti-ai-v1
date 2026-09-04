// Collapsible references card for a RAG-grounded General-chat answer (2026-09-04).
//
// Design notes
// - Collapsed by default: one quiet row (book icon · label · count · chevron). The
//   farmer reads the answer first; the sources are one tap away, not in the way.
// - Every visible word comes with the message from the backend (`refs.label`,
//   `refs.pageWord`, `refs.pagesWord`, titles, publishers). The component has no
//   string of its own, so it needs no locale file and works for all app languages.
// - Motion only answers the tap (chevron turn + Radix open/close); nothing animates
//   on its own. Trigger is a real <button> (keyboard + screen-reader friendly).
import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { CitationRefs } from './types';

interface CitationReferencesProps {
  refs: CitationRefs;
  className?: string;
}

export function CitationReferences({ refs, className }: CitationReferencesProps) {
  const [open, setOpen] = useState(false);
  const items = refs?.items ?? [];
  if (!items.length) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('mt-1', className)}>
      <CollapsibleTrigger
        className={cn(
          'group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40',
          'px-2.5 py-1 text-xs text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        aria-label={`${refs.label} (${items.length})`}
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{refs.label}</span>
        <span className="tabular-nums opacity-80">{items.length}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none">
        <ol className="mt-2 space-y-2 border-l-2 border-border/70 pl-3">
          {items.map((it) => {
            const pages = it.pages?.length
              ? `${it.pages.length > 1 ? refs.pagesWord : refs.pageWord} ${it.pages.join(', ')}`
              : null;
            return (
              <li key={it.documentId} className="text-xs leading-snug">
                <div className="font-medium text-foreground/90 line-clamp-2">{it.title}</div>
                <div className="text-muted-foreground line-clamp-1">
                  {it.publisher}
                  {pages ? <span className="tabular-nums"> · {pages}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default CitationReferences;
