## Community Page — Missing Translation Keys Audit

I scanned every `t('...')` call in `src/components/community/**` and `src/pages/CommunityPage.tsx`, then verified each key against the merged i18n bundle (`src/i18n/locales/en.json` + all `src/i18n/locales/en/*.json` namespaces).

**Result: 81 keys used, 13 missing across 3 languages (en/hi/mr).**

### Missing Keys

| Key | Used in | Fallback (English) |
|---|---|---|
| `empty.saved` | `CommunityPage.tsx` | "No saved posts yet" |
| `empty.saved_hint` | `CommunityPage.tsx` | "Tap the bookmark icon on any post to save it" |
| `common.undo` | `PostCard.tsx` | "Undo" |
| `social.post.report` | `PostCard.tsx` | "Report post" |
| `social.comments.title` | `CommentsSheet.tsx` | "Comments" |
| `social.comments.empty` | `CommentsSheet.tsx` | "Be the first to comment" |
| `social.comments.placeholder` | `CommentsSheet.tsx` | "Write a comment…" |
| `social.report.title` | `ReportReasonSheet.tsx` | "Why are you reporting this post?" |
| `social.report.spam` | `ReportReasonSheet.tsx` | "Spam or scam" |
| `social.report.misinformation` | `ReportReasonSheet.tsx` | "Wrong farming advice" |
| `social.report.abuse` | `ReportReasonSheet.tsx` | "Abusive or unsafe" |
| `social.report.other` | `ReportReasonSheet.tsx` | "Something else" |
| `social.report.thanks` | `PostCard.tsx` | "Reported. Thank you." |

### Implementation Plan

1. **Add `undo` key** to `common` namespace in all 3 languages:
   - `src/i18n/locales/en/common.json`
   - `src/i18n/locales/hi/common.json`
   - `src/i18n/locales/mr/common.json`

2. **Add `empty.saved` and `empty.saved_hint`** as a top-level `empty` namespace. The cleanest place is inside `social.json` under `social.empty` (already exists with `feed`, `my_posts` keys) — but the call site uses `t('empty.saved')` (no `social.` prefix). Two options:
   - **(Chosen)** Update `CommunityPage.tsx` to call `t('social.empty.saved')` / `t('social.empty.saved_hint')` (the keys already partially exist there) and add `saved` + `saved_hint` to the `social.empty` block in en/hi/mr `social.json`. This keeps the namespace consistent with siblings (`feed`, `my_posts`).

3. **Add `social.post.report`** to the `social.post` block in en/hi/mr `social.json`.

4. **Add a new `social.comments` block** (`title`, `empty`, `placeholder`) to en/hi/mr `social.json`.

5. **Add a new `social.report` block** (`title`, `spam`, `misinformation`, `abuse`, `other`, `thanks`) to en/hi/mr `social.json`.

### Translations (rural-farmer-friendly)

**Hindi (Devanagari)**
- `common.undo`: "वापस लें"
- `social.empty.saved`: "अभी कोई सहेजी गई पोस्ट नहीं"
- `social.empty.saved_hint`: "किसी भी पोस्ट के बुकमार्क पर टैप करें"
- `social.post.report`: "पोस्ट की शिकायत करें"
- `social.comments.title`: "टिप्पणियाँ"
- `social.comments.empty`: "पहली टिप्पणी आप करें"
- `social.comments.placeholder`: "टिप्पणी लिखें…"
- `social.report.title`: "इस पोस्ट की शिकायत क्यों कर रहे हैं?"
- `social.report.spam`: "स्पैम या धोखा"
- `social.report.misinformation`: "गलत खेती की सलाह"
- `social.report.abuse`: "अपमानजनक या असुरक्षित"
- `social.report.other`: "कुछ और"
- `social.report.thanks`: "शिकायत मिल गई। धन्यवाद।"

**Marathi**
- `common.undo`: "पूर्ववत करा"
- `social.empty.saved`: "अद्याप कोणत्याही पोस्ट जतन केलेल्या नाहीत"
- `social.empty.saved_hint`: "कोणत्याही पोस्टवर बुकमार्क टॅप करा"
- `social.post.report`: "पोस्टची तक्रार करा"
- `social.comments.title`: "टिप्पण्या"
- `social.comments.empty`: "पहिली टिप्पणी तुम्ही करा"
- `social.comments.placeholder`: "टिप्पणी लिहा…"
- `social.report.title`: "या पोस्टची तक्रार का करत आहात?"
- `social.report.spam`: "स्पॅम किंवा फसवणूक"
- `social.report.misinformation`: "चुकीचा शेती सल्ला"
- `social.report.abuse`: "अपमानास्पद किंवा असुरक्षित"
- `social.report.other`: "इतर"
- `social.report.thanks`: "तक्रार नोंदवली. धन्यवाद."

### Files to Edit (10)

- `src/pages/CommunityPage.tsx` — change `t('empty.saved')` → `t('social.empty.saved')`, same for hint
- `src/i18n/locales/en/common.json`, `hi/common.json`, `mr/common.json`
- `src/i18n/locales/en/social.json`, `hi/social.json`, `mr/social.json`

### Out of Scope
The `missing-report.json` audit lists ~487 missing keys across PWA / Auth / NDVI / Schemes / Advisory / Sync / Toasts. The user's request is scoped to the **Community page**, so those are not addressed here. I can do a follow-up pass if desired.
