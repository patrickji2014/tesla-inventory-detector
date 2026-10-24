/**
 * Automated Tests for 24/7 CI Background Scanner Logic
 */

const fs = require('fs');
const path = require('path');
const { describe, it, expect } = require('./test_helpers');
const ciScanner = require('../scripts/check_inventory_ci');

describe('CI Scanner - Configuration & Snapshot Loading', () => {
  it('loads active targets from targets.json or fallback', () => {
    const targets = ciScanner.loadTargets();
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0].zip).toBe('94065');
    expect(targets[0].range).toBe(200);
  });

  it('loads previous snapshot structure', () => {
    const snapshot = ciScanner.loadPreviousSnapshot();
    expect(typeof snapshot).toBe('object');
    expect(snapshot.targets !== undefined).toBe(true);
  });
});
