# Phase 7: Testing & Validation Guide

## Overview
Comprehensive testing checklist and validation procedures for the KisanShakti Agricultural Platform.

---

## 🎯 Testing Categories

### 1. Authentication & Authorization Testing

#### ✅ User Authentication Flow
```
[ ] PIN creation works correctly
[ ] PIN login validates properly
[ ] PIN reset functionality works
[ ] Session persistence works
[ ] Logout clears session correctly
[ ] Auto-logout on timeout works
```

#### ✅ Authorization & RLS
```
[ ] Users can only see their own data
[ ] Cross-tenant data isolation works
[ ] Admin-only functions are restricted
[ ] Storage policies enforce user ownership
[ ] Edge function auth validation works
```

**Test Script:**
```typescript
// Test tenant isolation
const testTenantIsolation = async () => {
  // Login as User A (Tenant 1)
  const userA = await login('userA');
  const landsA = await fetchLands(); // Should only see User A's lands
  
  // Login as User B (Tenant 2)  
  const userB = await login('userB');
  const landsB = await fetchLands(); // Should only see User B's lands
  
  // Verify no overlap
  assert(landsA.length > 0);
  assert(landsB.length > 0);
  assert(!landsA.some(land => landsB.includes(land)));
};
```

---

### 2. Land Management Testing

#### ✅ Land CRUD Operations
```
[ ] Create new land with boundary
[ ] View land details
[ ] Edit land information
[ ] Delete land
[ ] Upload land photos
[ ] View land on map
```

#### ✅ Boundary Drawing
```
[ ] Google Maps boundary drawing works
[ ] Polygon coordinates are saved correctly
[ ] Area calculation is accurate
[ ] Boundary editing works
[ ] Boundary overlaps are detected
```

**Test Cases:**
```typescript
// Test land creation
const testLandCreation = async () => {
  const newLand = {
    name: "Test Farm",
    area: 10.5,
    location: "Test Location",
    boundary_geojson: mockGeoJSON,
    crops: ["wheat", "rice"],
  };
  
  const created = await createLand(newLand);
  assert(created.id);
  assert(created.name === newLand.name);
  assert(created.area === newLand.area);
};
```

---

### 3. Weather Integration Testing

#### ✅ Weather Data Fetching
```
[ ] Current weather loads correctly
[ ] 7-day forecast displays properly
[ ] Weather alerts show up
[ ] Agricultural insights are generated
[ ] Weather icons render correctly
[ ] Temperature units conversion works
```

#### ✅ Weather API Fallback
```
[ ] Tomorrow.io API works as primary
[ ] OpenWeather API works as fallback
[ ] Error handling for API failures
[ ] Rate limiting works correctly
```

**Test API Call:**
```bash
# Test weather endpoint
curl -X POST https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/weather \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "action": "current",
    "lat": 28.7041,
    "lon": 77.1025,
    "units": "metric"
  }'
```

---

### 4. AI Features Testing

#### ✅ AI Chat Interface
```
[ ] General chat works
[ ] Land-specific chat works
[ ] Image upload in chat works
[ ] Chat history persists
[ ] Typing indicators work
[ ] Voice input works (if enabled)
```

#### ✅ AI Schedule Generation
```
[ ] Schedule generation works for crops
[ ] Tasks are properly dated
[ ] Climate alerts are generated
[ ] Schedule refinements work
[ ] Marketing insights are generated
```

**Test Chat:**
```typescript
const testAIChat = async () => {
  const message = "What is the best time to plant wheat?";
  const response = await sendChatMessage(message);
  
  assert(response.content.length > 0);
  assert(response.role === 'assistant');
  assert(response.session_id);
};
```

---

### 5. Storage Testing

#### ✅ File Upload Testing
```
[ ] Avatar upload works
[ ] Land photo upload works
[ ] Chat attachment upload works
[ ] Soil report upload works
[ ] Social post upload works
[ ] File size validation works
[ ] File type validation works
```

#### ✅ File Access Testing
```
[ ] Public files are accessible
[ ] Private files require authentication
[ ] Users cannot access others' files
[ ] Signed URLs work for temporary access
[ ] File deletion works
```

**Storage Test:**
```typescript
const testStorageUpload = async () => {
  const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
  const userId = 'test-user-id';
  
  // Upload avatar
  const url = await uploadAvatar(userId, file);
  assert(url.includes('avatars'));
  
  // Verify file exists
  const files = await listFiles('avatars', userId);
  assert(files.length > 0);
  
  // Clean up
  await deleteFile('avatars', `${userId}/test.jpg`);
};
```

---

### 6. Edge Functions Testing

#### ✅ All Edge Functions
```
[ ] weather - Weather data fetching
[ ] ai-agriculture-chat - AI chat responses
[ ] ai-smart-schedule - Schedule generation
[ ] ai-schedule-monitor - Schedule monitoring
[ ] ai-schedule-climate-monitor - Climate alerts
[ ] ai-marketing-insights - Market insights
[ ] lands-api - Land CRUD operations
[ ] tenant-config - Tenant configuration
[ ] get-white-label-config - Branding config
[ ] google-maps-config - Maps API config
[ ] generate-manifest - PWA manifest
```

**Edge Function Test Template:**
```typescript
const testEdgeFunction = async (functionName: string, payload: any) => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: payload
  });
  
  assert(!error, `Function ${functionName} failed: ${error?.message}`);
  assert(data, `Function ${functionName} returned no data`);
  console.log(`✅ ${functionName} test passed`);
};
```

---

### 7. Offline Functionality Testing

#### ✅ PWA Features
```
[ ] App installs as PWA
[ ] Service worker registers correctly
[ ] Offline data caching works
[ ] Sync queue processes correctly
[ ] Offline indicator shows properly
[ ] Background sync works
```

#### ✅ Data Sync Testing
```
[ ] Offline changes queue correctly
[ ] Online changes sync immediately
[ ] Conflict resolution works
[ ] Sync status updates correctly
```

---

### 8. Multi-Tenant Testing

#### ✅ Tenant Isolation
```
[ ] Domain-based tenant resolution works
[ ] Subdomain routing works correctly
[ ] Custom domains work properly
[ ] Tenant-specific branding applies
[ ] Data isolation is enforced
[ ] Cross-tenant access is blocked
```

#### ✅ Tenant Middleware
```
[ ] Tenant resolution from domain works
[ ] Fallback to default tenant works
[ ] Edge runtime domain handling works
[ ] Tenant caching works correctly
[ ] Blocked tenants are rejected
```

**Tenant Test:**
```typescript
const testTenantResolution = async () => {
  // Test with different domains
  const domains = [
    'kisanshakti.example.com',
    'farmtech.example.com',
    'localhost'
  ];
  
  for (const domain of domains) {
    const tenant = await resolveTenantFromDomain(domain);
    assert(tenant, `Tenant not found for domain: ${domain}`);
    console.log(`✅ Tenant resolved for ${domain}: ${tenant.name}`);
  }
};
```

---

### 9. Performance Testing

#### ✅ Load Time Metrics
```
[ ] Initial page load < 3 seconds
[ ] Route transitions < 500ms
[ ] API responses < 2 seconds
[ ] Image loading optimized
[ ] Bundle size is reasonable
```

#### ✅ Database Performance
```
[ ] Land queries < 500ms
[ ] Weather queries < 1 second
[ ] Chat queries < 500ms
[ ] Schedule queries < 1 second
[ ] Indexes are properly used
```

---

### 10. Security Testing

#### ✅ Security Checklist
```
[ ] No exposed API keys in frontend
[ ] Environment variables are secure
[ ] JWT tokens expire properly
[ ] Rate limiting works
[ ] SQL injection protection works
[ ] XSS protection is in place
[ ] CSRF tokens are used where needed
[ ] Sensitive data is encrypted
```

#### ✅ RLS Testing
```
[ ] Run Supabase linter
[ ] Fix all ERROR-level issues
[ ] Review WARN-level issues
[ ] Verify all tables have RLS enabled
[ ] Test RLS policies manually
```

**Security Audit:**
```bash
# Run Supabase linter
# Visit: https://supabase.com/dashboard/project/qfklkkzxemsbeniyugiz/database/linter

# Check for exposed secrets
grep -r "SUPABASE_" src/
grep -r "API_KEY" src/

# Verify environment variables
cat .env
```

---

## 🧪 Automated Test Suite

### Example Test Runner
```typescript
import { describe, it, expect } from '@jest/globals';

describe('KisanShakti Platform Tests', () => {
  describe('Authentication', () => {
    it('should create PIN successfully', async () => {
      const result = await createPIN('123456');
      expect(result.success).toBe(true);
    });
    
    it('should login with correct PIN', async () => {
      const session = await loginWithPIN('123456');
      expect(session).toBeDefined();
    });
  });
  
  describe('Land Management', () => {
    it('should create land with boundary', async () => {
      const land = await createLand(mockLandData);
      expect(land.id).toBeDefined();
      expect(land.boundary_geojson).toBeDefined();
    });
  });
  
  describe('Weather Integration', () => {
    it('should fetch current weather', async () => {
      const weather = await fetchWeather(28.7041, 77.1025);
      expect(weather.temp).toBeGreaterThan(-50);
      expect(weather.temp).toBeLessThan(60);
    });
  });
});
```

---

## 📊 Test Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Authentication | 90% |
| Land Management | 85% |
| Weather Integration | 80% |
| AI Features | 75% |
| Storage Service | 85% |
| Edge Functions | 80% |
| Multi-Tenant Logic | 90% |

---

## 🔍 Manual Testing Checklist

### Critical User Flows

#### Flow 1: New User Onboarding
```
[ ] 1. Open app
[ ] 2. Select language
[ ] 3. Create 6-digit PIN
[ ] 4. Login with PIN
[ ] 5. Add first land with boundary
[ ] 6. View weather for location
[ ] 7. Generate crop schedule
```

#### Flow 2: Existing User Daily Use
```
[ ] 1. Login with PIN
[ ] 2. Check today's tasks
[ ] 3. Mark task as complete
[ ] 4. Check weather updates
[ ] 5. Chat with AI about crop
[ ] 6. View land health (NDVI)
```

#### Flow 3: Offline Usage
```
[ ] 1. Open app while online
[ ] 2. Go offline
[ ] 3. Add new land (queued)
[ ] 4. Complete tasks (queued)
[ ] 5. Go back online
[ ] 6. Verify sync works
```

---

## 🐛 Known Issues & Workarounds

### Issue 1: Weather Function Edge Runtime Error
**Status**: ✅ FIXED
**Fix**: Added edge-runtime.supabase.com to tenant fallback

### Issue 2: Security Linter Warnings
**Status**: ⚠️ PENDING
**Action Required**: Fix RLS disabled tables

---

## 📈 Performance Benchmarks

### Target Metrics
```
First Contentful Paint (FCP): < 1.5s
Largest Contentful Paint (LCP): < 2.5s  
Time to Interactive (TTI): < 3.5s
Cumulative Layout Shift (CLS): < 0.1
First Input Delay (FID): < 100ms
```

### Current Measurements
Run: `npm run build && npm run preview`
Use Lighthouse in Chrome DevTools

---

## ✅ Phase 7 Testing Status

### Completed
- [x] Storage service implementation
- [x] Frontend utilities created
- [x] Testing documentation written
- [x] Edge function tenant resolution fixed

### In Progress
- [ ] Security linter issue resolution
- [ ] Automated test suite implementation
- [ ] Performance optimization

### Pending
- [ ] End-to-end test automation
- [ ] Load testing with real users
- [ ] Security penetration testing

---

## 🔗 Resources

- [Testing Best Practices](https://testing-library.com/docs/react-testing-library/intro/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/getting-started/testing)
- [PWA Testing](https://web.dev/pwa-checklist/)
- [Edge Function Logs](https://supabase.com/dashboard/project/qfklkkzxemsbeniyugiz/functions)

---

**Last Updated**: 2025-11-21
**Status**: Phase 7 Documentation Complete ✅
