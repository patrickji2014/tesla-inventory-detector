/**
 * Tesla Inventory API & Diffing Engine
 * Pure JavaScript module for constructing Tesla inventory queries,
 * normalizing vehicle records, diffing inventory changes, and handling multi-proxy fetching.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TeslaApi = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TESLA_BASE_URL = 'https://www.tesla.com';
  const INVENTORY_API_PATH = '/inventory/api/v1/inventory-results';

  // Trim mapping for Model Y
  const MODEL_Y_TRIMS = {
    ALL: { id: 'ALL', label: 'All Trims', codes: [] },
    RWD: { id: 'RWD', label: 'Rear-Wheel Drive (Standard)', codes: ['MYRWD', 'SRRWD', 'LRRWD'] },
    LRAWD: { id: 'LRAWD', label: 'Long Range All-Wheel Drive', codes: ['LRAWD', 'MYLRAWD'] },
    PERFORMANCE: { id: 'PERFORMANCE', label: 'Performance', codes: ['PERFORMANCE', 'MYPERFORMANCE'] }
  };

  /**
   * Validates a US 5-digit zip code.
   * @param {string} zip
   * @returns {boolean}
   */
  function isValidZip(zip) {
    return typeof zip === 'string' && /^\d{5}$/.test(zip.trim());
  }

  /**
   * Validates search range in miles.
   * @param {number|string} range
   * @returns {boolean}
   */
  function isValidRange(range) {
    const num = Number(range);
    return Number.isFinite(num) && num >= 0 && num <= 1000;
  }

  /**
   * Builds the Tesla inventory search payload for a given configuration.
   * @param {Object} options
   * @param {string} options.zip - 5-digit zip code
   * @param {number} [options.range=200] - Search radius in miles
   * @param {string} [options.trim='ALL'] - Trim identifier (ALL, RWD, LRAWD, PERFORMANCE)
   * @param {number} [options.maxPrice=null] - Maximum vehicle price filter
   * @param {string} [options.model='my'] - Model code ('my' for Model Y)
   * @param {string} [options.condition='new'] - Vehicle condition ('new' or 'used')
   * @returns {Object} JSON search structure
   */
  function buildQueryPayload(options = {}) {
    const zip = (options.zip || '').trim();
    if (!isValidZip(zip)) {
      throw new Error(`Invalid zip code: "${options.zip}". Must be a 5-digit US postal code.`);
    }

    const range = Number(options.range !== undefined ? options.range : 200);
    const trim = (options.trim || 'ALL').toUpperCase();
    const model = (options.model || 'my').toLowerCase();
    const condition = (options.condition || 'new').toLowerCase();

    const query = {
      model: model,
      condition: condition,
      arrangeby: 'Price',
      order: 'asc',
      market: 'US',
      language: 'en',
      super_region: 'north america',
      zip: zip,
      range: range
    };

    if (trim && trim !== 'ALL' && MODEL_Y_TRIMS[trim]) {
      query.options = {
        TRIM: MODEL_Y_TRIMS[trim].codes
      };
    }

    return {
      query: query,
      offset: 0,
      count: 50,
      outsideOffset: 0,
      outsideSearch: false
    };
  }

  /**
   * Builds the full Tesla inventory webpage URL (for opening in Safari).
   * @param {Object} options - { zip, range, trim, condition }
   * @returns {string} e.g. https://www.tesla.com/inventory/new/my?arrangeby=plh&zip=94065&range=200
   */
  function buildInventoryWebUrl(options = {}) {
    const zip = (options.zip || '').trim();
    const range = options.range !== undefined ? options.range : 200;
    const model = (options.model || 'my').toLowerCase();
    const condition = (options.condition || 'new').toLowerCase();

    const params = new URLSearchParams({
      arrangeby: 'plh',
      zip: zip,
      range: String(range),
      PaymentType: 'finance'
    });

    return `${TESLA_BASE_URL}/inventory/${condition}/${model}?${params.toString()}`;
  }

  /**
   * Builds the Tesla API direct query URL.
   * @param {Object} options
   * @returns {string} Direct API URL with encoded query
   */
  function buildApiUrl(options = {}) {
    const payload = buildQueryPayload(options);
    const queryString = encodeURIComponent(JSON.stringify(payload));
    return `${TESLA_BASE_URL}${INVENTORY_API_PATH}?query=${queryString}`;
  }

  /**
   * Normalizes a vehicle record returned by the Tesla inventory API.
   * @param {Object} rawVehicle - Raw vehicle item from API results
   * @returns {Object} Normalized vehicle object
   */
  function normalizeVehicle(rawVehicle) {
    if (!rawVehicle || typeof rawVehicle !== 'object') {
      return null;
    }

    const vin = rawVehicle.VIN || rawVehicle.Id || rawVehicle.vin || 'UNKNOWN_VIN';
    const trimCode = rawVehicle.TrimCode || rawVehicle.trimCode || '';
    const trimName = rawVehicle.TrimName || rawVehicle.trimName || formatTrimName(trimCode, rawVehicle.Model);
    const price = rawVehicle.PurchasePrice || rawVehicle.Price || rawVehicle.TotalPrice || 0;
    const originalPrice = rawVehicle.OriginalPrice || price;
    const discount = originalPrice > price ? originalPrice - price : 0;

    const paint = Array.isArray(rawVehicle.PAINT) && rawVehicle.PAINT[0]
      ? formatOptionName(rawVehicle.PAINT[0])
      : (rawVehicle.Paint || 'Solid Black');

    const interior = Array.isArray(rawVehicle.INTERIOR) && rawVehicle.INTERIOR[0]
      ? formatOptionName(rawVehicle.INTERIOR[0])
      : (rawVehicle.Interior || 'All Black');

    const wheels = Array.isArray(rawVehicle.WHEELS) && rawVehicle.WHEELS[0]
      ? formatOptionName(rawVehicle.WHEELS[0])
      : (rawVehicle.Wheels || 'Standard Wheels');

    const city = rawVehicle.City || rawVehicle.MetroName || '';
    const state = rawVehicle.StateProvince || rawVehicle.State || '';
    const location = [city, state].filter(Boolean).join(', ') || 'Inventory Hub';
    const odometer = rawVehicle.Odometer || 0;

    // Monthly payment calculation estimation (if available)
    const monthlyFinance = rawVehicle.FinancePayment || rawVehicle.MonthlyPayment || null;

    // Deep link to purchase/reserve page
    const directUrl = `${TESLA_BASE_URL}/my/order/${vin}`;

    return {
      vin: vin,
      model: (rawVehicle.Model || 'my').toUpperCase(),
      trimName: trimName,
      trimCode: trimCode,
      price: price,
      originalPrice: originalPrice,
      discount: discount,
      paint: paint,
      interior: interior,
      wheels: wheels,
      location: location,
      odometer: odometer,
      monthlyFinance: monthlyFinance,
      directUrl: directUrl,
      raw: rawVehicle
    };
  }

  /**
   * Format option code to clean display string.
   */
  function formatOptionName(code) {
    if (!code) return '';
    const clean = code
      .replace(/^(COL1_|IN_|WY_)/, '')
      .replace(/_/g, ' ')
      .toLowerCase();
    return clean.replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Format trim code to human-readable label.
   */
  function formatTrimName(code, model) {
    if (!code) return 'Model Y';
    const upper = code.toUpperCase();
    if (upper.includes('PERF')) return 'Model Y Performance';
    if (upper.includes('LRAWD') || upper.includes('LONG')) return 'Model Y Long Range AWD';
    if (upper.includes('RWD') || upper.includes('STANDARD')) return 'Model Y Rear-Wheel Drive';
    return `Model Y ${code}`;
  }

  /**
   * Parses the raw API JSON response into a normalized list of vehicles.
   * @param {Object} jsonResponse - Response object from Tesla API
   * @param {Object} [filters={}] - Optional filters like maxPrice and trim
   * @returns {Array<Object>} List of normalized vehicles
   */
  function parseApiResponse(jsonResponse, filters = {}) {
    if (!jsonResponse || typeof jsonResponse !== 'object') {
      return [];
    }

    const rawList = Array.isArray(jsonResponse.results) ? jsonResponse.results : [];
    let vehicles = rawList.map(normalizeVehicle).filter(Boolean);

    // Apply client-side trim filter if specified
    if (filters.trim && filters.trim !== 'ALL') {
      const allowedCodes = (MODEL_Y_TRIMS[filters.trim] || {}).codes || [];
      if (allowedCodes.length > 0) {
        vehicles = vehicles.filter(v => {
          return allowedCodes.some(code =>
            v.trimCode.toUpperCase().includes(code) ||
            v.trimName.toUpperCase().includes(code)
          );
        });
      }
    }

    // Apply client-side maxPrice filter if specified
    if (filters.maxPrice && Number(filters.maxPrice) > 0) {
      const max = Number(filters.maxPrice);
      vehicles = vehicles.filter(v => v.price <= max);
    }

    return vehicles;
  }

  /**
   * Diffing engine: Compares current inventory vehicles against previously known vehicles.
   * Identifies newly arrived cars, removed/sold cars, and existing cars.
   * 
   * @param {Array<Object>} currentVehicles - Freshly parsed vehicles from current check
   * @param {Array<Object>|Set<string>} previousVehiclesOrVins - Known vehicles or VIN set from previous check
   * @returns {Object} Diff result: { hasNew: boolean, newVehicles: [], removedVins: [], total: number }
   */
  function diffInventory(currentVehicles = [], previousVehiclesOrVins = []) {
    const knownVinSet = new Set();

    if (previousVehiclesOrVins instanceof Set) {
      previousVehiclesOrVins.forEach(v => knownVinSet.add(v));
    } else if (Array.isArray(previousVehiclesOrVins)) {
      previousVehiclesOrVins.forEach(item => {
        if (typeof item === 'string') {
          knownVinSet.add(item);
        } else if (item && item.vin) {
          knownVinSet.add(item.vin);
        }
      });
    }

    const newVehicles = [];
    const currentVinSet = new Set();

    currentVehicles.forEach(v => {
      currentVinSet.add(v.vin);
      if (!knownVinSet.has(v.vin)) {
        newVehicles.push(v);
      }
    });

    const removedVins = [];
    knownVinSet.forEach(vin => {
      if (!currentVinSet.has(vin)) {
        removedVins.push(vin);
      }
    });

    return {
      hasNew: newVehicles.length > 0,
      newVehicles: newVehicles,
      removedVins: removedVins,
      currentVehicles: currentVehicles,
      totalCount: currentVehicles.length
    };
  }

  /**
   * Formats currency amounts as USD.
   * @param {number} amount
   * @returns {string} e.g. "$44,990"
   */
  function formatCurrency(amount) {
    if (!Number.isFinite(amount)) return '$0';
    return '$' + Math.round(amount).toLocaleString('en-US');
  }

  return {
    MODEL_Y_TRIMS,
    isValidZip,
    isValidRange,
    buildQueryPayload,
    buildInventoryWebUrl,
    buildApiUrl,
    normalizeVehicle,
    parseApiResponse,
    diffInventory,
    formatCurrency
  };
});
