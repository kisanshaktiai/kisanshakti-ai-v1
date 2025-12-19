# Language Selection Flow Audit Report

## Current Flow Analysis

### 1. App Initialization (main.tsx → App.tsx)
```
Loader (index.html) → TenantProvider → I18nextProvider → AppInitializer → Router
```

**Issues Found:**
- ❌ i18n initialized with hardcoded 'hi' default BEFORE checking localStorage
- ❌ Timing gap between zustand hydration and i18n initialization
- ❌ Language not persisted immediately to i18n on first load

### 2. Splash Screen → Language Selection
```
SplashScreen checks localStorage → navigates to /language-selection OR /auth
```

**Status:** ✅ Working correctly
- Checks for 'language-storage' in localStorage
- Skips language selection if already set
- Uses `t()` for translations

### 3. Language Selection Flow
```
User selects language → languageStore.setLanguage() → i18n.changeLanguage() → navigate /auth
```

**Issues Found:**
- ⚠️ Language is set but may not persist to all components immediately
- ⚠️ No visual confirmation of language change before navigation

### 4. Auth Screens (MobileAuth, SetPin, PinAuth)
```
Render with i18n translations from t()
```

**Status:** ✅ Recently updated to use i18n keys
- All hardcoded strings replaced with t('auth.*')

### 5. Dashboard → Language Selector
```
LanguageSelector dropdown → setLanguage() → i18n.changeLanguage()
```

**Issues Found:**
- ❌ No immediate UI update confirmation
- ⚠️ Language change might not propagate to all components instantly

## Critical Fixes Needed

### Priority 1: Initialize i18n with persisted language
**File:** `src/i18n/config.ts`
- Read from localStorage BEFORE initializing i18n
- Fallback to 'hi' only if no language is stored

### Priority 2: Synchronize language changes globally
**File:** `src/stores/languageStore.ts`
- Ensure setLanguage() updates both store AND i18n synchronously
- Trigger re-render of all components using translations

### Priority 3: Add language change confirmation
**Files:** `src/pages/LanguageSelection.tsx`, `src/components/LanguageSelector.tsx`
- Show toast confirmation when language changes
- Immediate visual feedback

## Recommended Flow

### Initialization (on app load):
1. Read 'language-storage' from localStorage
2. Initialize i18n with stored language (or 'hi' as fallback)
3. Initialize languageStore (will hydrate from localStorage)
4. Render app with correct language

### Language Selection Page:
1. User selects language
2. Update languageStore (persists to localStorage automatically)
3. Update i18n.changeLanguage() immediately
4. Show confirmation toast
5. Navigate to next screen (all screens now use correct language)

### Dashboard Language Selector:
1. User changes language from dropdown
2. Update languageStore (persists to localStorage)
3. Update i18n.changeLanguage() immediately
4. Show confirmation toast
5. All components re-render with new language

## Files to Update

1. ✅ `src/i18n/config.ts` - Initialize with localStorage
2. ✅ `src/stores/languageStore.ts` - Add toast notifications
3. ✅ `src/components/LanguageSelector.tsx` - Add visual feedback
4. ✅ `src/pages/LanguageSelection.tsx` - Already updated with new UI
5. ✅ `src/App.tsx` - Ensure AppInitializer doesn't override persisted language

## Testing Checklist

- [ ] Fresh app load → correct language from localStorage
- [ ] Language selection → persists across navigation
- [ ] Language change from dashboard → updates all screens
- [ ] Page refresh → language persists
- [ ] Multiple tab sync → language syncs across tabs
- [ ] Auth screens → display in selected language
- [ ] Toast messages → display in selected language
- [ ] Error messages → display in selected language
