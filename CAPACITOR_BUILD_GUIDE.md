# KisanShakti - Native App Build Guide

This guide explains how to build the KisanShakti app as a native Android APK or iOS IPA.

## Prerequisites

### For Android:
- [Android Studio](https://developer.android.com/studio) installed
- Android SDK with API level 22+ (Android 5.1+)
- Java 17 or higher

### For iOS:
- macOS computer
- [Xcode](https://developer.apple.com/xcode/) 14.1+ installed
- Apple Developer account (for distribution)

## Quick Start

### 1. Export and Clone the Project

```bash
# Export project from Lovable using "Export to GitHub" button
# Then clone your repository:
git clone https://github.com/YOUR_USERNAME/kisanshakti-ai-v1.git
cd kisanshakti-ai-v1
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Add Native Platforms

```bash
# Add Android
npx cap add android

# Add iOS (macOS only)
npx cap add ios
```

### 4. Build the Web App

```bash
npm run build
```

### 5. Sync to Native Platforms

```bash
npx cap sync
```

## Building Android APK

### Development Build (Debug APK)

```bash
# Open in Android Studio
npx cap open android

# In Android Studio:
# 1. Wait for Gradle sync to complete
# 2. Build > Build Bundle(s) / APK(s) > Build APK(s)
# 3. Find APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

### Production Build (Release APK)

```bash
# In Android Studio:
# 1. Build > Generate Signed Bundle / APK
# 2. Select APK
# 3. Create or select your keystore
# 4. Choose release build variant
# 5. Find signed APK in android/app/release/
```

### Command Line Build

```bash
cd android
./gradlew assembleDebug    # Debug APK
./gradlew assembleRelease  # Release APK (requires signing config)
```

## Building iOS App

### Development Build

```bash
# Open in Xcode
npx cap open ios

# In Xcode:
# 1. Select your development team
# 2. Connect your iOS device or select a simulator
# 3. Press Cmd+R to run
```

### Production Build (App Store)

```bash
# In Xcode:
# 1. Product > Archive
# 2. Distribute App > App Store Connect
# 3. Follow the upload wizard
```

## Development Hot Reload

The `capacitor.config.ts` is configured for development hot reload:

```typescript
server: {
  url: 'https://1ca669aa-ddca-4527-a8c3-e8b29bf3e598.lovableproject.com?forceHideBadge=true',
  cleartext: true
}
```

**For production builds**, comment out or remove the `server` block to bundle the web app locally:

```typescript
// server: {
//   url: '...',
//   cleartext: true
// }
```

Then rebuild:
```bash
npm run build
npx cap sync
```

## App Configuration

### App Icons

Place your icons in:
- **Android**: `android/app/src/main/res/mipmap-*` folders
- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### Splash Screen

Configure in `capacitor.config.ts`:
```typescript
plugins: {
  SplashScreen: {
    launchShowDuration: 2000,
    backgroundColor: '#22c55e',
    // ...
  }
}
```

### Permissions

#### Android (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

#### iOS (`ios/App/App/Info.plist`):
```xml
<key>NSCameraUsageDescription</key>
<string>Camera access is needed for crop scanning</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location is needed for weather and land mapping</string>
<key>NSMicrophoneUsageDescription</key>
<string>Microphone is needed for voice commands</string>
```

## Updating the App

After making changes in Lovable:

```bash
git pull
npm install
npm run build
npx cap sync
```

Then rebuild in Android Studio or Xcode.

## Troubleshooting

### Android Build Fails
- Ensure Android SDK is up to date
- Run `npx cap sync android` again
- Check `android/local.properties` for correct SDK path

### iOS Build Fails
- Run `pod install` in the `ios/App` directory
- Ensure Xcode command line tools are installed
- Check signing configuration in Xcode

### App Shows Blank Screen
- Remove the `server` block from `capacitor.config.ts`
- Rebuild with `npm run build && npx cap sync`

### Hot Reload Not Working
- Ensure device is on same network as development machine
- Check the URL in `capacitor.config.ts` is accessible

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Publishing Guide](https://developer.android.com/studio/publish)
- [iOS App Store Guide](https://developer.apple.com/app-store/submitting/)
- [Lovable Capacitor Blog Post](https://lovable.dev/blog/capacitor-mobile-apps)
