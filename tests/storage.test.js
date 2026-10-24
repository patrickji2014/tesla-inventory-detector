/**
 * Unit Tests for Storage Manager
 */

const { describe, it, expect } = require('./test_helpers');
const StorageManager = require('../lib/storage');

describe('StorageManager - Watch Targets CRUD', () => {
  it('retrieves default watch target when storage is empty', () => {
    const targets = StorageManager.getWatchTargets();
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].zip).toBe('94065');
    expect(targets[0].range).toBe(200);
  });

  it('adds a new watch target with custom zip and range', () => {
    const added = StorageManager.addWatchTarget({
      zip: '90001',
      range: 50,
      trim: 'LRAWD',
      maxPrice: 48000
    });

    expect(added.zip).toBe('90001');
    expect(added.range).toBe(50);
    expect(added.trim).toBe('LRAWD');
    expect(added.maxPrice).toBe(48000);
    expect(added.enabled).toBe(true);

    const all = StorageManager.getWatchTargets();
    expect(all.some(t => t.id === added.id)).toBe(true);
  });

  it('updates an existing watch target', () => {
    const targets = StorageManager.getWatchTargets();
    const firstId = targets[0].id;

    const updated = StorageManager.updateWatchTarget(firstId, {
      vehicleCount: 5,
      lastChecked: 123456789
    });

    expect(updated.vehicleCount).toBe(5);
    expect(updated.lastChecked).toBe(123456789);
  });

  it('toggles target enabled state', () => {
    const targets = StorageManager.getWatchTargets();
    const firstId = targets[0].id;
    const originalState = targets[0].enabled;

    const newState = StorageManager.toggleWatchTarget(firstId);
    expect(newState).toBe(!originalState);

    // Toggle back
    const restoredState = StorageManager.toggleWatchTarget(firstId);
    expect(restoredState).toBe(originalState);
  });

  it('removes a watch target by ID', () => {
    const added = StorageManager.addWatchTarget({
      zip: '33101',
      range: 100
    });

    const removed = StorageManager.removeWatchTarget(added.id);
    expect(removed).toBe(true);

    const all = StorageManager.getWatchTargets();
    expect(all.some(t => t.id === added.id)).toBe(false);
  });
});

describe('StorageManager - Known VINs & Settings', () => {
  it('saves and retrieves known VINs for a target', () => {
    const targetId = 'test-target-vins';
    const vins = ['VIN_ABC_1', 'VIN_DEF_2'];

    StorageManager.saveKnownVins(targetId, vins);
    const retrieved = StorageManager.getKnownVins(targetId);

    expect(retrieved.has('VIN_ABC_1')).toBe(true);
    expect(retrieved.has('VIN_DEF_2')).toBe(true);
    expect(retrieved.has('VIN_OTHER')).toBe(false);

    StorageManager.clearKnownVins(targetId);
    const afterClear = StorageManager.getKnownVins(targetId);
    expect(afterClear.size).toBe(0);
  });

  it('saves and retrieves settings with defaults', () => {
    const initialSettings = StorageManager.getSettings();
    expect(initialSettings.pollIntervalMinutes).toBe(5);
    expect(initialSettings.soundAlert).toBe(true);

    StorageManager.saveSettings({
      pollIntervalMinutes: 2,
      ntfyTopic: 'tesla-my-alerts'
    });

    const updated = StorageManager.getSettings();
    expect(updated.pollIntervalMinutes).toBe(2);
    expect(updated.ntfyTopic).toBe('tesla-my-alerts');
    expect(updated.soundAlert).toBe(true);
  });

  it('caps scan logs at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      StorageManager.addScanLog({
        targetId: 't1',
        zip: '94065',
        range: 200,
        vehicleCount: i,
        newCount: 0,
        status: 'success'
      });
    }

    const logs = StorageManager.getScanLogs();
    expect(logs.length).toBe(50);
  });
});
