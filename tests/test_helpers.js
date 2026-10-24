/**
 * Zero-Dependency Test Runner & Assertion Library
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function describe(suiteName, fn) {
  console.log(`\n\x1b[1m\x1b[34m▶ ${suiteName}\x1b[0m`);
  fn();
}

function it(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } catch (err) {
    failedTests++;
    failures.push({ name: testName, error: err });
    console.log(`  \x1b[31m✗\x1b[0m ${testName}`);
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

async function itAsync(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } catch (err) {
    failedTests++;
    failures.push({ name: testName, error: err });
    console.log(`  \x1b[31m✗\x1b[0m ${testName}`);
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected) {
      const actualStr = JSON.stringify(actual);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(`Expected deep equality:\nActual:   ${actualStr}\nExpected: ${expectedStr}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, received: ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, received: ${actual}`);
      }
    },
    toContain(item) {
      if (typeof actual === 'string') {
        if (!actual.includes(item)) {
          throw new Error(`Expected string "${actual}" to contain "${item}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain item: ${JSON.stringify(item)}`);
        }
      } else if (actual instanceof Set) {
        if (!actual.has(item)) {
          throw new Error(`Expected Set to contain item: ${JSON.stringify(item)}`);
        }
      }
    },
    toThrow(msgSubstring) {
      let threw = false;
      try {
        actual();
      } catch (err) {
        threw = true;
        if (msgSubstring && !err.message.includes(msgSubstring)) {
          throw new Error(`Expected error message to contain "${msgSubstring}", got: "${err.message}"`);
        }
      }
      if (!threw) {
        throw new Error(`Expected function to throw, but it did not`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    }
  };
}

function printSummary() {
  console.log('\n==================================================');
  console.log(`Test Summary:`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log(`  Total:  ${totalTests}`);
  const rate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  console.log(`  Rate:   ${rate}%`);
  console.log('==================================================');

  if (failedTests > 0) {
    console.log('\nFailures:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}) ${f.name}\n     ${f.error.stack || f.error.message}`);
    });
    return false;
  }
  return true;
}

module.exports = {
  describe,
  it,
  itAsync,
  expect,
  printSummary
};
