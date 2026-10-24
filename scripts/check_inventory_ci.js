#!/usr/bin/env node
/**
 * Automated 24/7 Background Tesla Inventory Scanner (CI / Server / Runner)
 * 
 * Runs independently on GitHub Actions or local node server.
 * Enables background monitoring when iPhone Safari is closed or screen is locked.
 * 
 * - Queries Tesla inventory directly (no browser CORS restrictions)
 * - Identifies newly listed Model Y vehicles
 * - Updates data/inventory_snapshot.json
 * - Sends mobile push notification via ntfy.sh (optional NTFY_TOPIC env)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TeslaApi = require('../lib/tesla_api');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'inventory_snapshot.json');
const TARGETS_FILE = path.join(DATA_DIR, 'targets.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Loads configured targets or uses default target.
 */
function loadTargets() {
  if (fs.existsSync(TARGETS_FILE)) {
    try {
      const content = fs.readFileSync(TARGETS_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(t => t.enabled !== false);
      }
    } catch (err) {
      console.warn('[CI Scanner] Failed to parse targets.json, using default:', err.message);
    }
  }

  return [
    {
      id: 'default-target-94065-200',
      zip: '94065',
      range: 200,
      trim: 'ALL',
      maxPrice: null,
      enabled: true
    }
  ];
}

/**
 * Loads previous snapshot.
 */
function loadPreviousSnapshot() {
  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    } catch (_) {}
  }
  return { lastUpdated: 0, targets: {}, vehicles: [] };
}

/**
 * Makes HTTPS GET request with browser headers.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.tesla.com/inventory/new/my'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 150)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

/**
 * Sends lock-screen push notification to iPhone via ntfy.sh.
 */
function sendNtfyPush(topic, title, message, clickUrl) {
  return new Promise((resolve) => {
    if (!topic) return resolve(false);

    const cleanTopic = topic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
    const options = {
      hostname: 'ntfy.sh',
      port: 443,
      path: `/${encodeURIComponent(cleanTopic)}`,
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': 'high',
        'Tags': 'car,zap,rotating_light',
        'Click': clickUrl || 'https://www.tesla.com/inventory/new/my'
      }
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });

    req.on('error', (err) => {
      console.warn('[CI Scanner] Push notification failed:', err.message);
      resolve(false);
    });

    req.write(message);
    req.end();
  });
}

/**
 * Main execution function.
 */
async function run() {
  console.log(`[CI Scanner] Starting background check at ${new Date().toISOString()}`);

  const targets = loadTargets();
  const previousSnapshot = loadPreviousSnapshot();
  const ntfyTopic = process.env.NTFY_TOPIC || '';

  const newSnapshot = {
    lastUpdated: Date.now(),
    lastUpdatedIso: new Date().toISOString(),
    targets: {},
    vehicles: []
  };

  const allFoundVehicles = [];
  const newlyDiscoveredAlerts = [];

  for (const target of targets) {
    console.log(`\nChecking Target: Zip ${target.zip}, Range ${target.range} mi, Trim: ${target.trim || 'ALL'}`);
    const apiUrl = TeslaApi.buildApiUrl(target);

    try {
      const rawData = await httpsGet(apiUrl);
      const vehicles = TeslaApi.parseApiResponse(rawData, {
        trim: target.trim,
        maxPrice: target.maxPrice
      });

      console.log(`✓ Fetched ${vehicles.length} matching vehicles from Tesla API`);

      const prevTargetData = previousSnapshot.targets[target.id] || {};
      const prevVins = new Set(prevTargetData.vins || []);
      const diff = TeslaApi.diffInventory(vehicles, prevVins);

      newSnapshot.targets[target.id] = {
        zip: target.zip,
        range: target.range,
        trim: target.trim,
        maxPrice: target.maxPrice,
        vins: vehicles.map(v => v.vin),
        vehicleCount: vehicles.length,
        vehicles: vehicles,
        lastChecked: Date.now()
      };

      allFoundVehicles.push(...vehicles);

      if (diff.hasNew && prevVins.size > 0) {
        console.log(`🚨 NEW INVENTORY DETECTED: ${diff.newVehicles.length} new car(s)!`);
        diff.newVehicles.forEach(car => {
          console.log(`   - ${car.trimName} | ${TeslaApi.formatCurrency(car.price)} | VIN: ${car.vin} | ${car.location}`);
          newlyDiscoveredAlerts.push({
            target,
            car
          });
        });
      } else {
        console.log(`- No new vehicles since last check.`);
      }

    } catch (err) {
      console.warn(`✗ Target check failed for ${target.zip}:`, err.message);
      // Retain previous target data if fetch failed temporarily
      if (previousSnapshot.targets[target.id]) {
        newSnapshot.targets[target.id] = previousSnapshot.targets[target.id];
      }
    }
  }

  // Deduplicate all vehicles by VIN
  const uniqueMap = new Map();
  allFoundVehicles.forEach(v => uniqueMap.set(v.vin, v));
  newSnapshot.vehicles = Array.from(uniqueMap.values());

  // Save new snapshot to disk
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(newSnapshot, null, 2), 'utf8');
  console.log(`\n[CI Scanner] Saved updated snapshot with ${newSnapshot.vehicles.length} total vehicles.`);

  // Dispatch lock-screen push notifications if any new cars appeared
  if (newlyDiscoveredAlerts.length > 0 && ntfyTopic) {
    const totalNew = newlyDiscoveredAlerts.length;
    const first = newlyDiscoveredAlerts[0];
    const pushTitle = `🚗 ${totalNew} New Model Y Available! (${first.target.zip})`;
    const pushMsg = `${first.car.trimName} for ${TeslaApi.formatCurrency(first.car.price)} in ${first.car.location}! Tap to view on Tesla.`;
    const pushUrl = first.car.directUrl || TeslaApi.buildInventoryWebUrl(first.target);

    console.log(`[CI Scanner] Dispatching iPhone lock-screen push to topic: ${ntfyTopic}`);
    const ok = await sendNtfyPush(ntfyTopic, pushTitle, pushMsg, pushUrl);
    console.log(`[CI Scanner] Push sent: ${ok ? 'SUCCESS' : 'FAILED'}`);
  }

  console.log(`[CI Scanner] Completed successfully.`);
}

if (require.main === module) {
  run().catch(err => {
    console.error('[CI Scanner] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  loadTargets,
  loadPreviousSnapshot,
  httpsGet,
  sendNtfyPush,
  run
};
