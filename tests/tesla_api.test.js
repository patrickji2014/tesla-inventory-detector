/**
 * Unit Tests for Tesla API & Diffing Engine
 */

const { describe, it, expect } = require('./test_helpers');
const TeslaApi = require('../lib/tesla_api');

describe('TeslaApi - Validation', () => {
  it('validates 5-digit US zip codes correctly', () => {
    expect(TeslaApi.isValidZip('94065')).toBe(true);
    expect(TeslaApi.isValidZip('90001')).toBe(true);
    expect(TeslaApi.isValidZip('00501')).toBe(true);
    expect(TeslaApi.isValidZip('9406')).toBe(false);
    expect(TeslaApi.isValidZip('940655')).toBe(false);
    expect(TeslaApi.isValidZip('9406A')).toBe(false);
    expect(TeslaApi.isValidZip('')).toBe(false);
    expect(TeslaApi.isValidZip(null)).toBe(false);
  });

  it('validates search range in miles', () => {
    expect(TeslaApi.isValidRange(200)).toBe(true);
    expect(TeslaApi.isValidRange('50')).toBe(true);
    expect(TeslaApi.isValidRange(0)).toBe(true);
    expect(TeslaApi.isValidRange(-10)).toBe(false);
    expect(TeslaApi.isValidRange(1500)).toBe(false);
    expect(TeslaApi.isValidRange('invalid')).toBe(false);
  });
});

describe('TeslaApi - URL & Payload Generation', () => {
  it('builds standard query payload for Model Y with zip 94065 and 200mi range', () => {
    const payload = TeslaApi.buildQueryPayload({
      zip: '94065',
      range: 200
    });

    expect(payload.query.model).toBe('my');
    expect(payload.query.condition).toBe('new');
    expect(payload.query.zip).toBe('94065');
    expect(payload.query.range).toBe(200);
    expect(payload.query.arrangeby).toBe('Price');
    expect(payload.query.order).toBe('asc');
    expect(payload.query.market).toBe('US');
    expect(payload.query.language).toBe('en');
    expect(payload.query.super_region).toBe('north america');
    expect(payload.count).toBe(50);
  });

  it('adds trim filter to query payload when specified', () => {
    const payload = TeslaApi.buildQueryPayload({
      zip: '94065',
      range: 200,
      trim: 'LRAWD'
    });

    expect(payload.query.options.TRIM).toContain('LRAWD');
  });

  it('throws an error if zip code is invalid', () => {
    expect(() => {
      TeslaApi.buildQueryPayload({ zip: '123' });
    }).toThrow('Invalid zip code');
  });

  it('builds full inventory webpage URL for Safari', () => {
    const url = TeslaApi.buildInventoryWebUrl({
      zip: '94065',
      range: 200
    });

    expect(url).toContain('https://www.tesla.com/inventory/new/my');
    expect(url).toContain('zip=94065');
    expect(url).toContain('range=200');
    expect(url).toContain('arrangeby=plh');
    expect(url).toContain('PaymentType=finance');
  });

  it('builds direct API URL with valid encoded JSON query parameter', () => {
    const apiUrl = TeslaApi.buildApiUrl({
      zip: '94065',
      range: 200
    });

    expect(apiUrl).toContain('https://www.tesla.com/inventory/api/v1/inventory-results?query=');
    const encoded = apiUrl.split('?query=')[1];
    const decoded = JSON.parse(decodeURIComponent(encoded));
    expect(decoded.query.zip).toBe('94065');
    expect(decoded.query.range).toBe(200);
  });
});

describe('TeslaApi - Vehicle Normalization & Parsing', () => {
  it('normalizes raw Tesla vehicle JSON record', () => {
    const raw = {
      VIN: '7SAYGDEE1RA123456',
      Model: 'my',
      TrimCode: 'LRAWD',
      TrimName: 'Model Y Long Range All-Wheel Drive',
      PurchasePrice: 44990,
      OriginalPrice: 47990,
      PAINT: ['COL1_STEALTH_GREY'],
      INTERIOR: ['IN_ALL_BLACK'],
      WHEELS: ['WY_19_CROSSFLOW'],
      City: 'Fremont',
      StateProvince: 'CA',
      Odometer: 15
    };

    const vehicle = TeslaApi.normalizeVehicle(raw);
    expect(vehicle.vin).toBe('7SAYGDEE1RA123456');
    expect(vehicle.model).toBe('MY');
    expect(vehicle.price).toBe(44990);
    expect(vehicle.originalPrice).toBe(47990);
    expect(vehicle.discount).toBe(3000);
    expect(vehicle.paint).toContain('Stealth Grey');
    expect(vehicle.interior).toContain('All Black');
    expect(vehicle.location).toBe('Fremont, CA');
    expect(vehicle.directUrl).toContain('/my/order/7SAYGDEE1RA123456');
  });

  it('parses API response with client-side price filter', () => {
    const mockResponse = {
      total_matches_found: 2,
      results: [
        {
          VIN: 'VIN_CAR_1',
          Model: 'my',
          TrimCode: 'LRAWD',
          PurchasePrice: 43000
        },
        {
          VIN: 'VIN_CAR_2',
          Model: 'my',
          TrimCode: 'PERFORMANCE',
          PurchasePrice: 53000
        }
      ]
    };

    const allVehicles = TeslaApi.parseApiResponse(mockResponse);
    expect(allVehicles.length).toBe(2);

    const filteredVehicles = TeslaApi.parseApiResponse(mockResponse, {
      maxPrice: 45000
    });
    expect(filteredVehicles.length).toBe(1);
    expect(filteredVehicles[0].vin).toBe('VIN_CAR_1');
  });
});

describe('TeslaApi - Diffing Engine', () => {
  it('detects newly arrived vehicles compared against previous VIN list', () => {
    const currentVehicles = [
      { vin: 'VIN_EXISTING_1', price: 44990, trimName: 'Long Range AWD' },
      { vin: 'VIN_NEW_ARRIVAL', price: 42990, trimName: 'Rear-Wheel Drive' }
    ];

    const previousVins = new Set(['VIN_EXISTING_1']);

    const diff = TeslaApi.diffInventory(currentVehicles, previousVins);
    expect(diff.hasNew).toBe(true);
    expect(diff.newVehicles.length).toBe(1);
    expect(diff.newVehicles[0].vin).toBe('VIN_NEW_ARRIVAL');
    expect(diff.totalCount).toBe(2);
  });

  it('detects no new vehicles when inventory is unchanged', () => {
    const currentVehicles = [
      { vin: 'VIN_1', price: 44990 },
      { vin: 'VIN_2', price: 49990 }
    ];

    const previousVins = ['VIN_1', 'VIN_2'];

    const diff = TeslaApi.diffInventory(currentVehicles, previousVins);
    expect(diff.hasNew).toBe(false);
    expect(diff.newVehicles.length).toBe(0);
    expect(diff.removedVins.length).toBe(0);
  });

  it('detects sold/removed vehicles', () => {
    const currentVehicles = [
      { vin: 'VIN_1', price: 44990 }
    ];

    const previousVins = ['VIN_1', 'VIN_SOLD_2'];

    const diff = TeslaApi.diffInventory(currentVehicles, previousVins);
    expect(diff.hasNew).toBe(false);
    expect(diff.removedVins).toContain('VIN_SOLD_2');
  });
});

describe('TeslaApi - Currency Formatting', () => {
  it('formats currency correctly', () => {
    expect(TeslaApi.formatCurrency(44990)).toBe('$44,990');
    expect(TeslaApi.formatCurrency(52450.75)).toBe('$52,451');
    expect(TeslaApi.formatCurrency(0)).toBe('$0');
  });
});
