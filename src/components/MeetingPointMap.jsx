import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsScript } from './AddressAutocomplete';

const FALLBACK_CENTER = { lat: 43.0389, lng: -87.9065 }; // Milwaukee

// Tap-to-drop / drag-to-move meeting-point pin for the event form
// (2026-10-04). Satellite view so you can see the actual doors and lots.
// Uses the same Google Maps script as the address search. Centers on the
// pin, else on the event address (Places lookup), else Milwaukee.
export default function MeetingPointMap({ lat, lng, address, onChange }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => { onChangeRef.current = onChange; });

  const placeMarker = (position) => {
    const g = window.google.maps;
    if (!markerRef.current) {
      markerRef.current = new g.Marker({ map: mapRef.current, position, draggable: true, title: 'Meeting point' });
      markerRef.current.addListener('dragend', (e) => {
        onChangeRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setMap(mapRef.current);
    }
  };

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !mapDivRef.current || !window.google?.maps) return;
        const g = window.google.maps;
        const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
        mapRef.current = new g.Map(mapDivRef.current, {
          center: hasPin ? { lat, lng } : FALLBACK_CENTER,
          zoom: hasPin ? 18 : 10,
          mapTypeId: 'hybrid',
          tilt: 0,
          streetViewControl: false,
          gestureHandling: 'cooperative'
        });
        if (hasPin) placeMarker({ lat, lng });
        mapRef.current.addListener('click', (e) => {
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          placeMarker(p);
          onChangeRef.current?.(p);
        });
        // No pin yet: center on the venue so you can find the right door.
        if (!hasPin && address && g.places?.PlacesService) {
          new g.places.PlacesService(mapRef.current).findPlaceFromQuery(
            { query: address, fields: ['geometry'] },
            (results, st) => {
              const loc = results?.[0]?.geometry?.location;
              if (st === g.places.PlacesServiceStatus.OK && loc && !markerRef.current) {
                mapRef.current.setCenter(loc);
                mapRef.current.setZoom(18);
              }
            }
          );
        }
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow changes made outside the map (pasted link, "Remove pin").
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const cur = markerRef.current?.getPosition();
      if (!cur || Math.abs(cur.lat() - lat) > 1e-7 || Math.abs(cur.lng() - lng) > 1e-7) {
        placeMarker({ lat, lng });
        mapRef.current.panTo({ lat, lng });
        if (mapRef.current.getZoom() < 16) mapRef.current.setZoom(18);
      }
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, status]);

  if (status === 'error') {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
        The map couldn't load. Paste a Google Maps link above instead.
      </p>
    );
  }

  return (
    <div>
      <div ref={mapDivRef} className="w-full h-64 rounded-lg border border-gray-300 bg-gray-100" />
      <p className="text-xs text-gray-500 mt-1">
        {status === 'loading' ? 'Loading map…' : 'Tap the map to drop the pin, or drag it to move it.'}
      </p>
    </div>
  );
}
