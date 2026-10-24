export const getCurrentCoordinates = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('This browser does not support location detection.'));
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
    (error) => {
      const messages = {
        1: 'Location permission was denied. Allow location access in your browser and try again.',
        2: 'Your current location is unavailable. Check device location services and try again.',
        3: 'Location detection timed out. Please try again.',
      };
      reject(new Error(messages[error.code] || 'Could not detect your current location.'));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
});

export const getCurrentBranchLocation = async () => {
  const coordinates = await getCurrentCoordinates();
  const lookupFailure = (addressLookupError) => ({ ...coordinates, addressLookupError });
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    zoom: '18',
    addressdetails: '1',
  });
  let response;
  try {
    response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return lookupFailure('Address lookup could not be reached. Check your internet connection; you can still enter the address manually.');
  }
  if (!response.ok) {
    return lookupFailure(`Address lookup failed (HTTP ${response.status}). Please retry or enter the address manually.`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    return lookupFailure('Address lookup returned an invalid response. Please retry or enter the address manually.');
  }
  const address = result?.address;
  if (!address || typeof address !== 'object') {
    return lookupFailure('No address could be resolved for this location. You can enter the address manually.');
  }

  const road = address.road || address.pedestrian || address.footway || address.path || '';
  const street = [address.house_number, road].filter(Boolean).join(' ').trim();
  const localArea = address.neighbourhood
    || address.suburb
    || address.quarter
    || address.hamlet
    || address.city_district
    || '';
  const addressLine1 = street
    || localArea
    || result.name
    || result.display_name?.split(',')[0]?.trim();
  const city = address.city || address.town || address.village || address.municipality || address.county || '';
  if (!addressLine1 || !city) {
    return lookupFailure('Address lookup did not return a street and city. Please enter the address manually.');
  }

  return {
    ...coordinates,
    addressLine1,
    city,
    stateOrProvince: address.state || address.region || '',
    postalCode: address.postcode || '',
    ...(address.country_code ? { countryCode: address.country_code.toUpperCase() } : {}),
  };
};
