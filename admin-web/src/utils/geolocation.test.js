import assert from 'node:assert/strict';
import test from 'node:test';
import { getCurrentBranchLocation } from './geolocation.js';

const withBrowserLocation = async (t, callback) => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 28.55, longitude: 77.34 } });
        },
      },
    },
  });
  t.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    globalThis.fetch = originalFetch;
  });
  await callback();
};

test('detects GPS and resolves branch address fields from reverse geocoding', async (t) => {
  await withBrowserLocation(t, async () => {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /nominatim\.openstreetmap\.org\/reverse/);
      assert.match(String(url), /lat=28\.55/);
      return {
        ok: true,
        json: async () => ({
          display_name: '221B High Street, Example City',
          address: {
            house_number: '221B',
            road: 'High Street',
            city: 'Example City',
            state: 'Example State',
            postcode: '123456',
            country_code: 'in',
          },
        }),
      };
    };

    assert.deepEqual(await getCurrentBranchLocation(), {
      latitude: 28.55,
      longitude: 77.34,
      addressLine1: '221B High Street',
      city: 'Example City',
      stateOrProvince: 'Example State',
      postalCode: '123456',
      countryCode: 'IN',
    });
  });
});

test('preserves detected coordinates and returns a visible warning if reverse geocoding fails', async (t) => {
  await withBrowserLocation(t, async () => {
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    assert.deepEqual(await getCurrentBranchLocation(), {
      latitude: 28.55,
      longitude: 77.34,
      addressLookupError: 'Address lookup failed (HTTP 503). Please retry or enter the address manually.',
    });
  });
});
