import React, { useEffect, useRef } from 'react';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

function loadGoogleMapsScript() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (window._googleMapsPromise) return window._googleMapsPromise;
  window._googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window._googleMapsPromise;
}

export default function AddressAutocomplete({ value, onChange, placeholder, className, required }) {
  const inputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const isSelectingRef = useRef(false);

  useEffect(() => { onChangeRef.current = onChange; });

  // Sync controlled value to DOM input, but not during a place selection
  useEffect(() => {
    if (inputRef.current && !isSelectingRef.current) {
      inputRef.current.value = value || '';
    }
  }, [value]);

  useEffect(() => {
    let autocomplete;
    loadGoogleMapsScript().then(() => {
      if (!inputRef.current) return;
      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address']
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place?.formatted_address) {
          isSelectingRef.current = true;
          inputRef.current.value = place.formatted_address;
          onChangeRef.current(place.formatted_address);
          setTimeout(() => { isSelectingRef.current = false; }, 200);
        }
      });
    }).catch(() => console.error('Failed to load Google Maps'));

    return () => {
      if (autocomplete) window.google?.maps?.event?.clearInstanceListeners(autocomplete);
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      required={required}
      defaultValue={value}
      onChange={(e) => onChangeRef.current(e.target.value)}
      placeholder={placeholder || '123 Main St, City, State 12345'}
      className={className}
      autoComplete="off"
    />
  );
}
