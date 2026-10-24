const componentValue = (components, type, key = 'long_name') =>
  components.find((component) => component.types?.includes(type))?.[key] || '';

export const reverseGeocode = async ({ latitude, longitude, apiKey, fetchImpl = fetch }) => {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Location coordinates are invalid.');
  }
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Add a Google Maps API key in POS Settings to fill the delivery address from GPS.');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${latitude},${longitude}`);
  url.searchParams.set('key', apiKey.trim());
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Google Maps address lookup failed (${response.status}).`);
  const result = await response.json();
  if (result.status === 'ZERO_RESULTS') {
    throw new Error('Google Maps could not find an address near this location. Enter it manually.');
  }
  if (result.status !== 'OK' || !result.results?.length) {
    const detail = result.error_message ? ` ${result.error_message.replaceAll(apiKey.trim(), '[redacted]')}` : '';
    throw new Error(`Google Maps address lookup failed (${result.status || 'unknown status'}).${detail}`);
  }

  const bestMatch = result.results.find((entry) => entry.types?.includes('street_address')) || result.results[0];
  const components = bestMatch.address_components || [];
  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const subpremise = componentValue(components, 'subpremise');
  const premise = componentValue(components, 'premise');
  const sublocality = componentValue(components, 'sublocality_level_1') ||
    componentValue(components, 'sublocality') ||
    componentValue(components, 'neighborhood');

  return {
    line1: [subpremise, premise, [streetNumber, route].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    line2: sublocality,
    city: componentValue(components, 'locality') ||
      componentValue(components, 'postal_town') ||
      componentValue(components, 'administrative_area_level_2'),
    state: componentValue(components, 'administrative_area_level_1'),
    postalCode: componentValue(components, 'postal_code'),
    formattedAddress: bestMatch.formatted_address || '',
  };
};
