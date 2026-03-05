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
  const autocompleteRef = useRef(null);
  const suppressRef = useRef(false); // Prevents onChange echo after place_changed

  // Keep input in sync with external value changes (e.g. venue autofill)
  useEffect(() => {
    if (inputRef.current && !suppressRef.current) {
      inputRef.current.value = value || '';
    }
  }, [value]);

  useEffect(() => {
    loadGoogleMapsScript().then(() => {
      if (!inputRef.current) return;

      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address']
      });

      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        if (place?.formatted_address) {
          suppressRef.current = true;
          onChange(place.formatted_address);
          // Set input value directly so it shows the selection
          if (inputRef.current) inputRef.current.value = place.formatted_address;
          setTimeout(() => { suppressRef.current = false; }, 100);
        }
      });
    }).catch(() => console.error('Failed to load Google Maps'));

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      required={required}
      defaultValue={value}
      onChange={(e) => {
        if (!suppressRef.current) onChange(e.target.value);
      }}
      placeholder={placeholder || '123 Main St, City, State 12345'}
      className={className}
      autoComplete="off"
    />
  );
}
