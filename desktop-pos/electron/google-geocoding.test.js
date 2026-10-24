import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseGeocode } from './google-geocoding.js';

const response = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 403,
  json: async () => body,
});

test('reverse geocodes coordinates into structured delivery fields', async () => {
  let requestedUrl;
  const address = await reverseGeocode({
    latitude: 12.9716,
    longitude: 77.5946,
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      requestedUrl = url;
      return response({
        status: 'OK',
        results: [{
          types: ['street_address'],
          formatted_address: '12 MG Road, Bengaluru, Karnataka 560001, India',
          address_components: [
            { long_name: '12', types: ['street_number'] },
            { long_name: 'MG Road', types: ['route'] },
            { long_name: 'Ashok Nagar', types: ['sublocality_level_1'] },
            { long_name: 'Bengaluru', types: ['locality'] },
            { long_name: 'Karnataka', types: ['administrative_area_level_1'] },
            { long_name: '560001', types: ['postal_code'] },
          ],
        }],
      });
    },
  });

  assert.equal(requestedUrl.origin, 'https://maps.googleapis.com');
  assert.equal(requestedUrl.searchParams.get('latlng'), '12.9716,77.5946');
  assert.equal(requestedUrl.searchParams.get('key'), 'test-key');
  assert.deepEqual(address, {
    line1: '12 MG Road',
    line2: 'Ashok Nagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    formattedAddress: '12 MG Road, Bengaluru, Karnataka 560001, India',
  });
});

test('rejects invalid coordinates without making a request', async () => {
  let requested = false;
  await assert.rejects(
    reverseGeocode({
      latitude: 91,
      longitude: 0,
      apiKey: 'test-key',
      fetchImpl: async () => { requested = true; },
    }),
    /coordinates are invalid/i,
  );
  assert.equal(requested, false);
});

test('reports missing keys and Google lookup errors', async () => {
  await assert.rejects(reverseGeocode({ latitude: 1, longitude: 2, apiKey: '' }), /Add a Google Maps API key/);
  await assert.rejects(
    reverseGeocode({
      latitude: 1,
      longitude: 2,
      apiKey: 'test-key',
      fetchImpl: async () => response({ status: 'REQUEST_DENIED', error_message: 'Enable the Geocoding API.' }),
    }),
    /REQUEST_DENIED.*Enable the Geocoding API/,
  );
});
