import React, { useState, useEffect, useRef } from 'react';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

// Load the Google Maps JS SDK once globally
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadGoogleMapsScript()
      .then(() => setReady(true))
      .catch(() => console.error('Failed to load Google Maps'));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
      fields: ['formatted_address']
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (place?.formatted_address) {
        onChange(place.formatted_address);
      }
    });

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [ready]);

  return (
    <input
      ref={inputRef}
      type="text"
      required={required}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || '123 Main St, City, State 12345'}
      className={className}
      autoComplete="off"
    />
  );
}
