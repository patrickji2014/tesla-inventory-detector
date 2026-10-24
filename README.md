# Tesla Model Y Inventory Watcher ⚡🚗

> **Real-time Tesla Model Y Inventory Scanner & iPhone Standalone Progressive Web App (PWA) with Multi-ZIP Tracking, Audio Chimes, and 24/7 Background Detection.**

---

## ✨ Features

### 📍 Multi-Location ZIP Code & Range Tracking
- **Customizable Search Radius**: Add multiple target locations (e.g. `94065` within `200 mi`, `90001` within `100 mi`).
- **Trim & Pricing Filters**:
  - Filter by Model Y trim: *All Trims*, *Long Range All-Wheel Drive*, *Performance*, or *Rear-Wheel Drive (Standard)*.
  - Optional Maximum Price threshold filter ($ USD).
- **Per-Target Toggle & Deep Links**:
  - Toggle individual locations on or off with a single tap.
  - One-tap `🌐 Open on Tesla.com` button to launch the exact pre-filtered Tesla inventory page directly in Safari.

### ⏱️ Automated Real-Time Refresh Timer
- **Live Visual Countdown**:
  - Radial progress bar and digital countdown display showing time until next inventory scan.
  - Configurable polling intervals: `1 min`, `2 min`, `5 min` (default), or `10 min`.
- **Immediate Scan**:
  - Instant `⚡ Check Now` button with loading feedback.

### 🔔 iPhone Alerts & Notifications
- **Web Audio Alert Chimes**:
  - Built-in multi-tone ascending chime (C5 $\rightarrow$ E5 $\rightarrow$ G5 $\rightarrow$ C6) synthesized via the Web Audio API. Zero audio files to download, works completely offline.
  - Instant `🔔` test button in header to verify audio and volume on your iPhone.
- **iOS Web Notifications**:
  - Native iOS notification banners when installed as a standalone PWA on Home Screen (`Notification.requestPermission()`).
- **Device Haptics**:
  - Tactile vibration patterns on supported mobile devices when new inventory arrives.

### 🛡️ 24/7 Background Detection (When Safari is Closed / Screen is Locked)
iOS Safari automatically suspends JavaScript execution in background tabs to save battery. To ensure you **never miss a new Model Y release**, Tesla Watch provides a dual-protection architecture:

1. **In-App Auto-Refresh**: Active real-time countdown polling whenever the app is open on your screen.
2. **GitHub Actions 24/7 Cloud Monitor**:
   - Automated workflow (`.github/workflows/inventory_check.yml`) runs on GitHub's cloud servers every 10 minutes.
   - Directly queries Tesla's inventory API (free from browser CORS restrictions).
   - Updates `data/inventory_snapshot.json` in the repository so your PWA loads fresh results immediately upon waking up.
3. **Optional iPhone Lock-Screen Push (ntfy.sh)**:
   - Enter any private topic name (e.g., `my-tesla-94065-alerts`) in Settings.
   - Install the free [ntfy iOS App](https://apps.apple.com/us/app/ntfy/id1625396347) (zero account required).
   - Receive instant lock-screen push notifications with sound even while sleeping or while your phone is locked in your pocket!

---

## 📱 How to Deploy to GitHub Pages & Install on iPhone

This application is built according to [`GITHUB_PWA_DEPLOYMENT_GUIDE.md`](file:///Users/pji/codespace/antigravity/gdoc-reminder/GITHUB_PWA_DEPLOYMENT_GUIDE.md):

### Step 1: Push Code to GitHub
1. Create a new repository on [GitHub](https://github.com/new) named `tesla-inventory-detector`.
2. Push your project to GitHub:
   ```bash
   git add .
   git commit -m "feat: initial Tesla Model Y Inventory Watcher release"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tesla-inventory-detector.git
   git push -u origin main
   ```

### Step 2: Enable GitHub Pages
1. On GitHub, navigate to **Settings** $\rightarrow$ **Pages** (under *Code and automation*).
2. Under **Build and deployment** $\rightarrow$ **Source**, choose **Deploy from a branch**.
3. Under **Branch**, select `main` and folder `/ (root)`.
4. Click **Save** and verify **Enforce HTTPS** is enabled.
5. Your app URL will be live at:
   ```
   https://<your-username>.github.io/tesla-inventory-detector/
   ```

### Step 3: Install to iPhone Home Screen
```
┌─────────────────────────────────────────────────────────────┐
│             How to Install on iPhone (Safari)               │
├─────────────────────────────────────────────────────────────┤
│ 1. Open Safari on your iPhone.                              │
│ 2. Navigate to your GitHub Pages URL:                       │
│    https://<your-username>.github.io/tesla-inventory-detector/
│ 3. Tap the Safari Share button at the bottom:               │
│    [ ↑ ] (Square box with an upward arrow)                  │
│ 4. Scroll down in the share sheet and tap:                  │
│    [ + ] "Add to Home Screen"                               │
│ 5. Tap "Add" top-right.                                     │
│ 6. Launch Tesla Watch directly from your iPhone Home Screen!│
└─────────────────────────────────────────────────────────────┘
```

When opened from the Home Screen, the app runs in **standalone fullscreen mode** without Safari address bars, respecting notch and Dynamic Island safe-area insets.

---

## 🧪 Automated Testing

The project includes an automated test suite verifying query formatting, diffing logic, storage persistence, and iOS PWA compliance:

```bash
# Run all automated tests
npm test
# or
node tests/run_all.js
```

### Test Suite Summary:
```text
==================================================
 Running Tesla Inventory Detector Automated Tests
==================================================

▶ TeslaApi - Validation
  ✓ validates 5-digit US zip codes correctly
  ✓ validates search range in miles

▶ TeslaApi - URL & Payload Generation
  ✓ builds standard query payload for Model Y with zip 94065 and 200mi range
  ✓ adds trim filter to query payload when specified
  ✓ throws an error if zip code is invalid
  ✓ builds full inventory webpage URL for Safari
  ✓ builds direct API URL with valid encoded JSON query parameter

▶ TeslaApi - Vehicle Normalization & Parsing
  ✓ normalizes raw Tesla vehicle JSON record
  ✓ parses API response with client-side price filter

▶ TeslaApi - Diffing Engine
  ✓ detects newly arrived vehicles compared against previous VIN list
  ✓ detects no new vehicles when inventory is unchanged
  ✓ detects sold/removed vehicles

▶ TeslaApi - Currency Formatting
  ✓ formats currency correctly

▶ StorageManager - Watch Targets CRUD
  ✓ retrieves default watch target when storage is empty
  ✓ adds a new watch target with custom zip and range
  ✓ updates an existing watch target
  ✓ toggles target enabled state
  ✓ removes a watch target by ID

▶ StorageManager - Known VINs & Settings
  ✓ saves and retrieves known VINs for a target
  ✓ saves and retrieves settings with defaults
  ✓ caps scan logs at 50 entries

▶ PWA - manifest.webmanifest Validation
  ✓ manifest file exists and is valid JSON

▶ PWA - iOS Safari Meta Tags in index.html
  ✓ index.html exists and contains mandatory iOS PWA tags

▶ PWA - sw.js Service Worker Verification
  ✓ sw.js exists and implements offline precaching and API bypass

▶ CI Scanner - Configuration & Snapshot Loading
  ✓ loads active targets from targets.json or fallback
  ✓ loads previous snapshot structure

==================================================
Test Summary:
  Passed: 26
  Failed: 0
  Total:  26
  Rate:   100%
==================================================
```

---

## 🗂️ Project Architecture

```
tesla_inventory_detector/
├── index.html                   # iOS Safari Standalone PWA UI & Controller
├── manifest.webmanifest         # PWA Manifest (display: standalone, theme, icons)
├── sw.js                        # Offline precaching Service Worker & Push listener
├── package.json                 # Project configuration & npm test script
├── lib/
│   ├── tesla_api.js             # Query builder, response parser, and inventory diffing engine
│   ├── storage.js               # Target CRUD, known VINs tracker, settings, & scan logs
│   ├── notifications.js         # Web Audio synthesizer chime, Web Notifications, & ntfy push
│   └── scanner.js               # Multi-target scanner coordinator & snapshot synchronizer
├── scripts/
│   └── check_inventory_ci.js    # 24/7 background scanner script for GitHub Actions
├── data/
│   ├── targets.json             # Target locations configuration (zip, range, trim)
│   └── inventory_snapshot.json  # Latest inventory snapshot
├── .github/workflows/
│   └── inventory_check.yml      # GitHub Actions scheduled 10-minute cron workflow
└── tests/
    ├── test_helpers.js          # Zero-dependency test assertion framework
    ├── tesla_api.test.js        # Tesla query, parser, and diffing unit tests
    ├── storage.test.js          # Target CRUD and settings persistence unit tests
    ├── pwa.test.js              # iOS Safari PWA meta tags & manifest verification
    ├── ci_scanner.test.js       # Background scanner configuration & structure tests
    └── run_all.js               # Master automated test runner
```

---

## 📄 License
MIT
