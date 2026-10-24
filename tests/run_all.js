#!/usr/bin/env node
/**
 * Master Test Runner for Tesla Inventory Detector
 */

const { printSummary } = require('./test_helpers');

console.log('==================================================');
console.log(' Running Tesla Inventory Detector Automated Tests');
console.log('==================================================');

// Run individual test suites
require('./tesla_api.test');
require('./storage.test');
require('./pwa.test');
require('./ci_scanner.test');

const success = printSummary();
if (!success) {
  process.exit(1);
} else {
  process.exit(0);
}
