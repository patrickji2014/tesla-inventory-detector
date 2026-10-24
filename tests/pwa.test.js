/**
 * Automated Tests for iOS Safari PWA Requirements
 * Conforms to GITHUB_PWA_DEPLOYMENT_GUIDE.md
 */

const fs = require('fs');
const path = require('path');
const { describe, it, expect } = require('./test_helpers');

const ROOT_DIR = path.join(__dirname, '..');

describe('PWA - manifest.webmanifest Validation', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.webmanifest');

  it('manifest file exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.name).toContain('Tesla');
    expect(parsed.display).toBe('standalone');
    expect(parsed.start_url).toBe('./index.html');
    expect(Array.isArray(parsed.icons)).toBe(true);
    expect(parsed.icons.length).toBeGreaterThan(0);
  });
});

describe('PWA - iOS Safari Meta Tags in index.html', () => {
  const htmlPath = path.join(ROOT_DIR, 'index.html');

  it('index.html exists and contains mandatory iOS PWA tags', () => {
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, 'utf8');

    // 1. Standalone mode meta tag
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');

    // 2. Status bar style
    expect(html).toContain('apple-mobile-web-app-status-bar-style');

    // 3. Notch and Dynamic Island viewport-fit=cover
    expect(html).toContain('viewport-fit=cover');

    // 4. Apple touch icon
    expect(html).toContain('<link rel="apple-touch-icon"');

    // 5. Manifest link
    expect(html).toContain('<link rel="manifest" href="manifest.webmanifest">');

    // 6. Safe area insets in CSS
    expect(html).toContain('env(safe-area-inset-top)');
    expect(html).toContain('env(safe-area-inset-bottom)');

    // 7. Service Worker registration
    expect(html).toContain('serviceWorker.register');
  });
});

describe('PWA - sw.js Service Worker Verification', () => {
  const swPath = path.join(ROOT_DIR, 'sw.js');

  it('sw.js exists and implements offline precaching and API bypass', () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const sw = fs.readFileSync(swPath, 'utf8');

    expect(sw).toContain('PRECACHE_ASSETS');
    expect(sw).toContain('index.html');
    expect(sw).toContain('manifest.webmanifest');
    expect(sw).toContain('addEventListener(\'install\'');
    expect(sw).toContain('addEventListener(\'activate\'');
    expect(sw).toContain('addEventListener(\'fetch\'');

    // Ensures external APIs and live inventory data bypass service worker caching
    expect(sw).toContain('tesla.com');
  });
});
