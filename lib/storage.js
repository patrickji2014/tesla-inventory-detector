/**
 * Local Storage & Settings Manager
 * Handles watch target configurations, known vehicle VINs, scan logs,
 * and user preferences for Tesla Inventory Detector.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StorageManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEYS = {
    TARGETS: 'tesla_watch_targets',
    KNOWN_VINS: 'tesla_known_vins',
    SETTINGS: 'tesla_detector_settings',
    SCAN_LOGS: 'tesla_scan_logs',
    LATEST_VEHICLES: 'tesla_latest_vehicles'
  };

  const DEFAULT_SETTINGS = {
    pollIntervalMinutes: 5,
    soundAlert: true,
    browserNotifications: true,
    ntfyTopic: '', // Optional ntfy.sh topic for background iPhone push alerts
    proxyUrl: '', // Optional custom proxy URL
    theme: 'dark'
  };

  const DEFAULT_TARGET = {
    id: 'default-target-94065-200',
    zip: '94065',
    range: 200,
    trim: 'ALL',
    condition: 'new',
    maxPrice: null,
    enabled: true,
    createdAt: Date.now(),
    lastChecked: null,
    vehicleCount: 0
  };

  /**
   * Safe localStorage wrapper with fallback.
   */
  const store = {
    _memory: {},
    getItem(key) {
      try {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(key);
        }
        return this._memory[key] || null;
      } catch (_) {
        return this._memory[key] || null;
      }
    },
    setItem(key, value) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
        this._memory[key] = value;
      } catch (_) {
        this._memory[key] = value;
      }
    },
    removeItem(key) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
        delete this._memory[key];
      } catch (_) {
        delete this._memory[key];
      }
    }
  };

  /**
   * Retrieves all watch targets. Initializes with default if empty.
   * @returns {Array<Object>}
   */
  function getWatchTargets() {
    try {
      const raw = store.getItem(STORAGE_KEYS.TARGETS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}

    // Initialize with default target
    const initial = [Object.assign({}, DEFAULT_TARGET)];
    saveWatchTargets(initial);
    return initial;
  }

  /**
   * Saves watch targets array to storage.
   * @param {Array<Object>} targets
   */
  function saveWatchTargets(targets) {
    if (!Array.isArray(targets)) return;
    store.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(targets));
  }

  /**
   * Adds a new watch target.
   * @param {Object} targetData - { zip, range, trim, maxPrice }
   * @returns {Object} Added target
   */
  function addWatchTarget(targetData) {
    const targets = getWatchTargets();
    const id = 'target_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const newTarget = {
      id: id,
      zip: (targetData.zip || '').trim(),
      range: Number(targetData.range) || 200,
      trim: (targetData.trim || 'ALL').toUpperCase(),
      condition: (targetData.condition || 'new').toLowerCase(),
      maxPrice: targetData.maxPrice ? Number(targetData.maxPrice) : null,
      enabled: targetData.enabled !== false,
      createdAt: Date.now(),
      lastChecked: null,
      vehicleCount: 0
    };

    targets.push(newTarget);
    saveWatchTargets(targets);
    return newTarget;
  }

  /**
   * Updates an existing watch target.
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  function updateWatchTarget(id, updates) {
    const targets = getWatchTargets();
    const index = targets.findIndex(t => t.id === id);
    if (index === -1) return null;

    targets[index] = Object.assign({}, targets[index], updates, { id: id });
    saveWatchTargets(targets);
    return targets[index];
  }

  /**
   * Toggles enabled state of a target.
   * @param {string} id
   * @returns {boolean} New enabled state
   */
  function toggleWatchTarget(id) {
    const targets = getWatchTargets();
    const target = targets.find(t => t.id === id);
    if (!target) return false;

    target.enabled = !target.enabled;
    saveWatchTargets(targets);
    return target.enabled;
  }

  /**
   * Removes a watch target by ID.
   * @param {string} id
   * @returns {boolean}
   */
  function removeWatchTarget(id) {
    let targets = getWatchTargets();
    const beforeCount = targets.length;
    targets = targets.filter(t => t.id !== id);

    if (targets.length !== beforeCount) {
      saveWatchTargets(targets);
      // Clean up known VINs for this target
      clearKnownVins(id);
      return true;
    }
    return false;
  }

  /**
   * Gets known VINs map or set for a target.
   * @param {string} [targetId]
   * @returns {Set<string>}
   */
  function getKnownVins(targetId) {
    try {
      const raw = store.getItem(STORAGE_KEYS.KNOWN_VINS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (targetId && parsed[targetId]) {
          return new Set(parsed[targetId]);
        }
        // Return all known VINs flattened if no targetId specified
        const allVins = new Set();
        Object.keys(parsed).forEach(k => {
          if (Array.isArray(parsed[k])) {
            parsed[k].forEach(vin => allVins.add(vin));
          }
        });
        return allVins;
      }
    } catch (_) {}
    return new Set();
  }

  /**
   * Saves known VINs for a target.
   * @param {string} targetId
   * @param {Array<string>|Set<string>} vins
   */
  function saveKnownVins(targetId, vins) {
    if (!targetId) return;
    try {
      let map = {};
      const raw = store.getItem(STORAGE_KEYS.KNOWN_VINS);
      if (raw) {
        map = JSON.parse(raw) || {};
      }
      map[targetId] = Array.from(vins);
      store.setItem(STORAGE_KEYS.KNOWN_VINS, JSON.stringify(map));
    } catch (_) {}
  }

  /**
   * Clears known VINs for a target.
   * @param {string} targetId
   */
  function clearKnownVins(targetId) {
    try {
      const raw = store.getItem(STORAGE_KEYS.KNOWN_VINS);
      if (raw) {
        const map = JSON.parse(raw) || {};
        delete map[targetId];
        store.setItem(STORAGE_KEYS.KNOWN_VINS, JSON.stringify(map));
      }
    } catch (_) {}
  }

  /**
   * Gets user settings merged with defaults.
   * @returns {Object}
   */
  function getSettings() {
    try {
      const raw = store.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
      }
    } catch (_) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  /**
   * Saves updated settings.
   * @param {Object} newSettings
   */
  function saveSettings(newSettings) {
    const current = getSettings();
    const merged = Object.assign({}, current, newSettings);
    store.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }

  /**
   * Adds a scan log entry and keeps only the latest 50 entries.
   * @param {Object} entry - { targetId, zip, range, vehicleCount, newCount, status, message }
   */
  function addScanLog(entry) {
    try {
      let logs = getScanLogs();
      const logEntry = Object.assign({
        id: 'log_' + Date.now(),
        timestamp: Date.now()
      }, entry);

      logs.unshift(logEntry);
      if (logs.length > 50) {
        logs = logs.slice(0, 50);
      }
      store.setItem(STORAGE_KEYS.SCAN_LOGS, JSON.stringify(logs));
      return logEntry;
    } catch (_) {
      return null;
    }
  }

  /**
   * Gets recent scan logs.
   * @returns {Array<Object>}
   */
  function getScanLogs() {
    try {
      const raw = store.getItem(STORAGE_KEYS.SCAN_LOGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  /**
   * Gets latest discovered vehicles list.
   * @returns {Array<Object>}
   */
  function getLatestVehicles() {
    try {
      const raw = store.getItem(STORAGE_KEYS.LATEST_VEHICLES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  /**
   * Saves latest discovered vehicles list.
   * @param {Array<Object>} vehicles
   */
  function saveLatestVehicles(vehicles) {
    if (!Array.isArray(vehicles)) return;
    store.setItem(STORAGE_KEYS.LATEST_VEHICLES, JSON.stringify(vehicles));
  }

  return {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_TARGET,
    getWatchTargets,
    saveWatchTargets,
    addWatchTarget,
    updateWatchTarget,
    toggleWatchTarget,
    removeWatchTarget,
    getKnownVins,
    saveKnownVins,
    clearKnownVins,
    getSettings,
    saveSettings,
    addScanLog,
    getScanLogs,
    getLatestVehicles,
    saveLatestVehicles
  };
});
