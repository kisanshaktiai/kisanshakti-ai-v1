# PWA Deployment Checklist

## ✅ Pre-Deployment Setup

### 1. **Configure Push Notifications (CRITICAL)**
The app currently uses a demo VAPID key. For production:

```bash
# Generate your own VAPID keys
npx web-push generate-vapid-keys
```

Then update `src/services/notificationService.ts` line 51 with your keys:
```typescript
const vapidPublicKey = 'YOUR_PUBLIC_KEY';
```

Store the private key as a Supabase secret:
```bash
# In Supabase dashboard: Settings → Edge Functions → Secrets
VAPID_PRIVATE_KEY=your_private_key
```

### 2. **Verify Icons Exist**
Ensure these files exist in `/public`:
- ✅ `/public/icon-192x192.png` (192x192px)
- ✅ `/public/icon-512x512.png` (512x512px)
- ✅ `/public/favicon.ico`

### 3. **Test Manifest Generation**
After deployment, verify:
```bash
curl https://yourdomain.com/.netlify/functions/generate-manifest
```

Should return tenant-specific manifest with:
- Correct app name
- Tenant colors
- Valid icon URLs

### 4. **Configure HTTPS (Required for PWA)**
PWA requires HTTPS. Lovable deployments include this by default.

### 5. **Service Worker Scope**
The service worker is configured for root scope `/` which is correct.

---

## 📱 Testing Checklist

### **Android (Chrome/Edge)**
1. Open app in Chrome
2. Wait 10 seconds - install prompt should appear
3. Tap "Install" - app should install to home screen
4. Open installed app - should run in standalone mode
5. Test offline - close app, disable network, reopen
6. Navigate `/install` page - manual install should work

### **iOS (Safari)**
1. Open app in Safari (NOT Chrome)
2. Tap Share button → "Add to Home Screen"
3. Confirm installation
4. Open from home screen - should run fullscreen
5. Note: iOS doesn't support automatic install prompts

### **Desktop (Chrome/Edge)**
1. Look for install icon in address bar
2. Click to install
3. App should open in standalone window
4. Test offline functionality

---

## 🐛 Troubleshooting

### **Install prompt not showing (Android)**
- Check console: `beforeinstallprompt` event should fire
- Verify HTTPS is enabled
- Clear browser cache
- Check if already installed (dismiss won't show again for 1-30 days)

### **iOS not installing**
- Must use Safari browser (not Chrome)
- Share menu → "Add to Home Screen" is manual only
- iOS doesn't support automatic prompts

### **Push notifications not working**
- Verify VAPID keys are configured
- Check notification permission status
- Test with: `/app/notifications/settings`
- Verify service worker is active

### **Manifest not loading**
- Check network tab for manifest request
- Verify edge function is deployed
- Check CORS headers
- Test manifest URL directly

---

## 🚀 Deployment Steps

1. **Commit all changes**
   ```bash
   git add .
   git commit -m "Fix PWA installation and add /install page"
   ```

2. **Deploy to production**
   - Click "Publish" in Lovable
   - Wait for deployment to complete

3. **Test on real devices**
   - Test Android phone
   - Test iPhone/iPad
   - Test desktop browser

4. **Monitor errors**
   - Check browser console
   - Check Supabase logs
   - Monitor user feedback

---

## 📊 Success Metrics

After deployment, monitor:
- Install rate (via analytics)
- Standalone mode usage
- Service worker hits
- Push notification delivery
- Offline usage patterns

---

## 🔒 Security Notes

1. **VAPID Keys** - Keep private key secret
2. **Manifest** - Served with proper CORS headers
3. **Service Worker** - Only works on HTTPS
4. **Notifications** - Require user permission

---

## 📚 Resources

- [PWA Install Criteria](https://web.dev/install-criteria/)
- [iOS PWA Guide](https://web.dev/articles/apple-touch-icon)
- [Push Notifications](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Web App Manifest](https://web.dev/add-manifest/)

---

## ✨ What Was Fixed

1. ✅ Added dynamic manifest loading with tenant branding
2. ✅ Fixed missing manifest href in index.html
3. ✅ Added A2HS meta tags for Android/Windows
4. ✅ Created dedicated `/install` page with platform detection
5. ✅ Added comprehensive install instructions for iOS
6. ✅ Improved install prompt UX with benefits
7. ✅ Added VAPID key configuration docs

**Users can now:**
- Install on Android via automatic prompt or `/install` page
- Install on iOS via manual Safari instructions on `/install` page
- Install on desktop via browser prompt or `/install` page
- See platform-specific installation guides
- Understand why they should install (benefits listed)
