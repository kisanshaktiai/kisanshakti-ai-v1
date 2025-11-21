# Deployment Guide for Hostinger

This guide covers deploying your React SPA to Hostinger or any Apache-based hosting provider.

## 🚀 Quick Deployment Steps

### 1. Build Your Application

```bash
npm run build
```

This creates a `dist` folder with all production files.

### 2. Upload to Hostinger

1. **Login to Hostinger cPanel**
2. **Open File Manager**
3. **Navigate to `public_html`** (or your domain's root directory)
4. **Delete existing files** (if any) in the target directory
5. **Upload all contents** from the `dist` folder

**Important:** Upload the contents of the `dist` folder, NOT the `dist` folder itself.

Your file structure should look like:
```
public_html/
├── index.html
├── .htaccess          ← Critical for routing!
├── _redirects         ← Backup config
├── assets/
│   ├── index-xxx.js
│   ├── index-xxx.css
│   └── ...
├── favicon.ico
└── ...
```

### 3. Verify .htaccess is Present

The `.htaccess` file is **critical** for SPA routing. It ensures that:
- Direct URL access works (e.g., `yoursite.com/weather`)
- Page refresh doesn't cause 404 errors
- All routes serve the React app

**If `.htaccess` is missing:**
1. Check if hidden files are visible in File Manager
2. Manually create `.htaccess` with the content from `public/.htaccess`
3. Ensure it's in the same directory as `index.html`

### 4. Test Your Deployment

Visit these URLs to verify routing works:
- ✅ `https://yourdomain.com/` (Home)
- ✅ `https://yourdomain.com/weather` (Weather page)
- ✅ `https://yourdomain.com/schedule` (Schedule page)
- ✅ Refresh any page → Should NOT show 404

## 🔧 Troubleshooting

### Problem: 404 Error on Page Refresh

**Cause:** `.htaccess` file is missing or not working

**Solution:**
1. Verify `.htaccess` exists in the same folder as `index.html`
2. Check file permissions (should be 644)
3. Ensure Apache `mod_rewrite` is enabled (ask hosting support)

### Problem: Blank Page After Deployment

**Cause:** Assets paths are incorrect

**Solution:**
1. Check browser console for 404 errors
2. Verify all files from `dist` were uploaded
3. Clear browser cache and retry

### Problem: CSS/JS Not Loading

**Cause:** File permissions or MIME types

**Solution:**
1. Set file permissions: `.css` and `.js` files to 644
2. Check if server is serving correct MIME types
3. Clear CDN cache if using Cloudflare

### Problem: "No tenant found" Error in Development

**Cause:** This is normal in Lovable preview mode

**Solution:**
This error is automatically handled with a fallback tenant in development. In production with your custom domain, ensure your domain is configured in the `tenants` table.

## 📝 Server Configuration Files

### .htaccess (Apache - Primary)
Located at: `public/.htaccess`

This file:
- ✅ Enables client-side routing
- ✅ Enables GZIP compression
- ✅ Sets up browser caching
- ✅ Adds security headers

### _redirects (Netlify - Backup)
Located at: `public/_redirects`

Backup configuration for Netlify-style hosting platforms.

## 🌐 Custom Domain Setup

If using a custom domain with Hostinger:

1. **Point Domain to Hostinger**
   - Update nameservers or A records
   - Wait for DNS propagation (up to 48 hours)

2. **Configure SSL Certificate**
   - Hostinger provides free SSL
   - Enable in cPanel → SSL/TLS

3. **Update Tenant Configuration**
   - Ensure your domain is registered in the `tenants` table
   - Update `white_label_configs` with your branding

## 🔒 Security Checklist

Before deploying to production:

- [ ] Enable SSL certificate (HTTPS)
- [ ] Configure CORS in Supabase for your domain
- [ ] Update environment variables if needed
- [ ] Test all routes and features
- [ ] Enable security headers (already in `.htaccess`)
- [ ] Set up monitoring and error tracking

## 📊 Performance Optimization

The `.htaccess` file includes:
- **GZIP Compression:** Reduces file sizes by ~70%
- **Browser Caching:** Static assets cached for 1 year
- **Proper MIME Types:** Ensures correct file handling

## 🆘 Need Help?

Common hosting support contacts:
- **Hostinger Support:** Available 24/7 via live chat
- **Community:** Check Hostinger knowledge base

## 📱 Mobile Testing

After deployment, test on:
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Different screen sizes
- [ ] Slow network (throttle in DevTools)

## ✅ Deployment Checklist

- [ ] Build completed without errors (`npm run build`)
- [ ] All files from `dist` uploaded to `public_html`
- [ ] `.htaccess` file is present and readable
- [ ] Direct URL access works for all routes
- [ ] Page refresh doesn't cause 404 errors
- [ ] Images and assets load correctly
- [ ] SSL certificate is active (HTTPS)
- [ ] Custom domain DNS is configured
- [ ] Tenant configuration is correct
- [ ] All features tested in production

---

**Last Updated:** 2025-11-21
**Version:** 1.0.0
