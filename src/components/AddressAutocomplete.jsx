import React, { useState, useEffect, useRef } from 'react';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY;

export default function AddressAutocomplete({ value, onChange, placeholder, className, required }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const sessionTokenRef = useRef(null);

  // Generate a session token (groups autocomplete + detail calls for billing)
  const getSessionToken = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = crypto.randomUUID();
    }
    return sessionTokenRef.current;
  };

  const resetSession = () => {
    sessionTokenRef.current = null;
  };

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&sessiontoken=${getSessionToken()}&key=${GOOGLE_API_KEY}`
      );
      const data = await res.json();
      if (data.status === 'OK') {
        setSuggestions(data.predictions || []);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    setShowSuggestions(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (prediction) => {
    onChange(prediction.description);
    setSuggestions([]);
    setShowSuggestions(false);
    resetSession(); // End billing session after selection
  };

  return (
    <div className="relative">
      <input
        type="text"
        required={required}
        value={value}
        onChange={handleChange}
        onFocus={() => value?.length >= 3 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder || '123 Main St, City, State 12345'}
        className={className}
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
          {suggestions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-4 py-2.5 hover:bg-red-50 border-b border-gray-100 last:border-0"
            >
              <div className="text-sm font-medium text-gray-900">
                {p.structured_formatting?.main_text || p.description}
              </div>
              {p.structured_formatting?.secondary_text && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {p.structured_formatting.secondary_text}
                </div>
              )}
            </button>
          ))}
          <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
            <img
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              alt="Powered by Google"
              className="h-4 ml-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
