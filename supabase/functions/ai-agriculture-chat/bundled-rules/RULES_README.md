# 🔐 Agricultural Decision Rules - Security Architecture

## ⚠️ PROPRIETARY & CONFIDENTIAL

This directory contains **bundled agricultural decision rules** that represent significant intellectual property and ICAR-based agricultural intelligence. These rules are the core of the decision brain system.

---

## 🏗️ Architecture Overview

```
Frontend (Client)           →  Edge Function (Server)  →  Database
    │                              │                        │
    │ NO RULE ACCESS               │ RULES LOADED HERE      │ AUDIT LOGS
    │                              │                        │
    └──────────────────────────────┴────────────────────────┘
```

### Key Security Principles:

1. **Rules Never Reach Client**: All rule evaluation happens server-side in Supabase Edge Functions
2. **Serialized Conditions**: Rule conditions are stored as strings and reconstructed only in the secure backend
3. **Checksum Validation**: Bundle integrity is verified before loading
4. **Version Control**: Rules are versioned to prevent stale execution
5. **Audit Logging**: Every rule execution is logged with tenant isolation

---

## 📁 File Structure

```
bundled-rules/
├── all-rules.ts       # Bundled rules (AUTO-GENERATED, placeholder committed)
├── all-rules.json     # JSON version (GITIGNORED - never commit)
├── metadata.json      # Rule metadata (GITIGNORED - never commit)
├── loader.ts          # Secure rule loading with validation
├── index.ts           # Central exports
├── .checksum          # Integrity verification (GITIGNORED)
└── RULES_README.md    # This file
```

---

## 🔒 Security Measures

### 1. Build-Time Bundling
Rules are bundled from `src/decision-graph/` at build time using:
```bash
npm run bundle-rules
```

This generates serialized rules that are:
- Function conditions converted to strings
- Enums converted to string literals
- Metadata attached for versioning

### 2. Server-Side Only Loading
The `loader.ts` module:
- Reconstructs condition functions using `new Function()` (safer than eval)
- Caches reconstructed functions for performance
- Validates checksums before loading
- Checks version compatibility

### 3. Client Cannot Access
- No rule files are imported in frontend code
- Frontend only communicates via Edge Function API
- No rule logic is included in client bundle (Vite)

### 4. Audit Trail
Every rule evaluation is logged to `advisory_audit_log` table with:
- Rule IDs fired
- Tenant ID (multi-tenancy isolation)
- Farmer ID
- Input snapshot
- Decision output

---

## 🚫 What NOT to Do

1. ❌ **Never import rule files in frontend code**
   ```typescript
   // BAD - Exposes rules to client
   import { CEREALS_RULES } from 'src/decision-graph/crop-group-rules/cereals';
   ```

2. ❌ **Never commit generated JSON files**
   ```bash
   # These are gitignored:
   all-rules.json
   metadata.json
   .checksum
   ```

3. ❌ **Never log full rule conditions**
   ```typescript
   // BAD - Exposes logic
   console.log(rule.conditionCode);
   ```

4. ❌ **Never return raw rules in API responses**
   ```typescript
   // BAD - Client sees rule logic
   return { rules: loadAllRules() };
   ```

---

## ✅ Correct Usage

### In Edge Function:
```typescript
import { loadAllRules, evaluateRules } from './bundled-rules/index.ts';

// Load rules (cached after first call)
const rules = loadAllRules();

// Evaluate against input
const matchingRules = evaluateRules(rules, decisionInput);

// Return ONLY the decision output, never the rules
return {
  causes: matchingRules.map(r => r.cause),
  recommendations: formatRecommendations(matchingRules),
  ruleIds: matchingRules.map(r => r.rule_id), // OK - just IDs
};
```

---

## 🔄 Deployment Process

### 1. Bundle Rules (CI/CD or Manual)
```bash
npm run bundle-rules
```

### 2. Deploy Edge Function
```bash
supabase functions deploy ai-agriculture-chat
```

### 3. Verify Rule Count
Check edge function logs for:
```
[RuleLoader] Loaded 2000+ total rules
```

---

## 📊 Rule Categories

| Category | Count | Description |
|----------|-------|-------------|
| Crop Group Rules | ~1,200 | Cereals, Pulses, Vegetables, etc. |
| Safety Rules | ~750 | Chemical safety, PHI, IPM, etc. |
| Advanced Rules | ~150 | PGR, Fertigation, Biological |
| Intelligence Rules | ~100 | Variety recommendations |
| **Total** | **2,000+** | ICAR-aligned agricultural rules |

---

## 🔍 Verification

### Check Rule Count in Edge Function:
```typescript
import { getRuleCount, getBundleMetadata } from './bundled-rules/index.ts';

console.log(`Total rules: ${getRuleCount()}`);
console.log(`Bundle version: ${getBundleMetadata().version}`);
console.log(`Generated at: ${getBundleMetadata().generatedAt}`);
```

### Expected Output:
```
Total rules: 2000+
Bundle version: 1.0.0
Generated at: 2024-XX-XXTXX:XX:XX.XXXZ
```

---

## 🛡️ Compliance

- **Data Protection**: Rules don't contain PII, but represent proprietary IP
- **Multi-Tenancy**: All rule evaluations are tenant-scoped
- **Audit Requirements**: Full decision traceability via `advisory_audit_log`

---

## 📞 Contact

For security concerns related to agricultural rules, contact the development team.

---

**⚠️ REMINDER: This is proprietary agricultural intelligence. Handle with care.**
