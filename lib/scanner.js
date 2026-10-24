/**
 * Tesla Inventory Scanner & Synchronizer
 * Orchestrates multi-target scanning, proxy resolution, GitHub Actions snapshot syncing,
 * and change notifications.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./tesla_api'),
      require('./storage'),
      require('./notifications')
    );
  } else {
    root.ScannerEngine = factory(
      root.TeslaApi,
      root.StorageManager,
      root.NotificationEngine
    );
  }
})(typeof self !== 'undefined' ? self : this, function (TeslaApi, StorageManager, NotificationEngine) {
  'use strict';

  // Snapshot file path on GitHub Pages
  const SNAPSHOT_PATH = './data/inventory_snapshot.json';

  /**
   * Fetches Tesla inventory through the best available channel.
   * Priority:
   * 1. Configured custom proxy URL (if provided in Settings)
   * 2. GitHub Actions background snapshot (updated automatically 24/7 even when phone is locked)
   * 3. Direct API fetch (or public CORS proxy fallback)
   * 
   * @param {Object} target - { zip, range, trim, maxPrice }
   * @param {Object} settings - User settings
   * @returns {Promise<Array<Object>>} List of normalized vehicles
   */
  async function fetchInventoryForTarget(target, settings = {}) {
    const apiUrl = TeslaApi.buildApiUrl(target);
    const filters = {
      trim: target.trim,
      maxPrice: target.maxPrice
    };

    // Strategy 1: User-configured custom proxy URL
    if (settings.proxyUrl && settings.proxyUrl.trim()) {
      try {
        const proxyEndpoint = settings.proxyUrl.includes('%s')
          ? settings.proxyUrl.replace('%s', encodeURIComponent(apiUrl))
          : `${settings.proxyUrl}?url=${encodeURIComponent(apiUrl)}`;

        const res = await fetch(proxyEndpoint, {
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          return TeslaApi.parseApiResponse(data, filters);
        }
      } catch (err) {
        console.warn('[Scanner] Custom proxy fetch failed:', err);
      }
    }

    // Strategy 2: GitHub Actions 24/7 background snapshot
    // GitHub Actions cron updates data/inventory_snapshot.json in the repo
    try {
      const snapshotUrl = `${SNAPSHOT_PATH}?_t=${Date.now()}`;
      const res = await fetch(snapshotUrl, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const snapshot = await res.json();
        // Check if snapshot contains data for this target or full catalog
        if (snapshot && snapshot.targets && snapshot.targets[target.id]) {
          const targetData = snapshot.targets[target.id];
          const vehicles = (targetData.vehicles || []).map(TeslaApi.normalizeVehicle);
          return applyClientFilters(vehicles, filters);
        } else if (snapshot && Array.isArray(snapshot.vehicles)) {
          // Filter vehicles matching target zip and range if catalog is combined
          const filtered = snapshot.vehicles.filter(v => {
            const matchesZip = !target.zip || v.location.includes(target.zip) || target.range >= 200;
            return matchesZip;
          }).map(TeslaApi.normalizeVehicle);
          return applyClientFilters(filtered, filters);
        }
      }
    } catch (_) {}

    // Strategy 3: Direct API fetch with browser headers
    try {
      const res = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        return TeslaApi.parseApiResponse(data, filters);
      }
    } catch (err) {
      // Expected CORS block on static GitHub Pages when no proxy or snapshot exists yet
    }

    // Fallback: If no network source responded, return empty list or cached vehicles
    return [];
  }

  /**
   * Applies client-side trim and maxPrice filters.
   */
  function applyClientFilters(vehicles, filters = {}) {
    let result = vehicles;
    if (filters.trim && filters.trim !== 'ALL') {
      const codes = (TeslaApi.MODEL_Y_TRIMS[filters.trim] || {}).codes || [];
      if (codes.length > 0) {
        result = result.filter(v =>
          codes.some(c =>
            v.trimCode.toUpperCase().includes(c) ||
            v.trimName.toUpperCase().includes(c)
          )
        );
      }
    }
    if (filters.maxPrice && Number(filters.maxPrice) > 0) {
      const max = Number(filters.maxPrice);
      result = result.filter(v => v.price <= max);
    }
    return result;
  }

  /**
   * Scans a single watch target and dispatches notifications if new vehicles appear.
   * @param {Object} target
   * @param {Object} [settings]
   * @returns {Promise<Object>} Scan outcome
   */
  async function scanTarget(target, settings = {}) {
    if (!target || !target.enabled) {
      return { skipped: true, reason: 'Target disabled or invalid' };
    }

    const currentVehicles = await fetchInventoryForTarget(target, settings);
    const knownVins = StorageManager.getKnownVins(target.id);
    const isFirstRun = knownVins.size === 0;

    const diff = TeslaApi.diffInventory(currentVehicles, knownVins);

    // Update target metadata
    StorageManager.updateWatchTarget(target.id, {
      lastChecked: Date.now(),
      vehicleCount: currentVehicles.length
    });

    // Update known VINs in storage
    const currentVinList = currentVehicles.map(v => v.vin);
    StorageManager.saveKnownVins(target.id, currentVinList);

    // If new cars are detected (and it's not the initial population with 0 known)
    let alerted = false;
    if (diff.hasNew && !isFirstRun) {
      const count = diff.newVehicles.length;
      const firstCar = diff.newVehicles[0];
      const title = `🚗 ${count} New Model Y Found in ${target.zip}!`;
      const body = `${firstCar.trimName} • ${TeslaApi.formatCurrency(firstCar.price)} (${target.range} mi)`;
      const url = firstCar.directUrl || TeslaApi.buildInventoryWebUrl(target);

      await NotificationEngine.dispatchAlert({
        title: title,
        body: body,
        url: url
      }, settings);

      alerted = true;
    }

    // Log the scan
    StorageManager.addScanLog({
      targetId: target.id,
      zip: target.zip,
      range: target.range,
      vehicleCount: currentVehicles.length,
      newCount: diff.newVehicles.length,
      status: 'success',
      message: `${currentVehicles.length} found (${diff.newVehicles.length} new)`
    });

    return {
      target: target,
      vehicles: currentVehicles,
      diff: diff,
      alerted: alerted
    };
  }

  /**
   * Scans all enabled watch targets sequentially.
   * @param {Object} [settings]
   * @returns {Promise<Array<Object>>}
   */
  async function scanAllTargets(settings) {
    const configSettings = settings || StorageManager.getSettings();
    const targets = StorageManager.getWatchTargets().filter(t => t.enabled);
    const results = [];
    const allDiscoveredVehicles = [];

    for (const target of targets) {
      try {
        const res = await scanTarget(target, configSettings);
        results.push(res);
        if (Array.isArray(res.vehicles)) {
          allDiscoveredVehicles.push(...res.vehicles);
        }
      } catch (err) {
        console.error(`[Scanner] Error scanning target ${target.zip}:`, err);
        StorageManager.addScanLog({
          targetId: target.id,
          zip: target.zip,
          range: target.range,
          vehicleCount: 0,
          newCount: 0,
          status: 'error',
          message: err.message || 'Scan failed'
        });
      }
    }

    // Deduplicate vehicles across targets by VIN
    const uniqueMap = new Map();
    allDiscoveredVehicles.forEach(v => {
      if (!uniqueMap.has(v.vin)) {
        uniqueMap.set(v.vin, v);
      }
    });
    StorageManager.saveLatestVehicles(Array.from(uniqueMap.values()));

    return results;
  }

  return {
    SNAPSHOT_PATH,
    fetchInventoryForTarget,
    scanTarget,
    scanAllTargets
  };
});
