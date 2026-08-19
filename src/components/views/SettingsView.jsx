import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, CheckCircle, XCircle, MapPin, Save, ToggleLeft, ToggleRight, Building2, Phone, Mail, User, ParkingCircle, Tag, Calendar, DollarSign, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getHostLabel, setHostLabel } from '../../utils/hostLabelHelper';
import AddressAutocomplete from '../AddressAutocomplete';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';


// --- Position rate row (uses position label, saves by key) ---
function PositionRateRow({ label, currentRate, onSave }) {
  const [val, setVal] = React.useState(currentRate);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setVal(currentRate);
    setDirty(false);
  }, [currentRate]);

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <span className="font-medium text-gray-900">{label}</span>
      <div className="flex items-center space-x-2">
        <span className="text-gray-500 text-sm">$</span>
        <input
          type="number" min="0" step="0.5"
          value={val}
          placeholder="—"
          onChange={e => { setVal(e.target.value); setDirty(true); }}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-red-500"
        />
        <span className="text-gray-500 text-sm">/hr</span>
        {dirty && (
          <button onClick={() => { onSave(val); setDirty(false); }}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center space-x-1">
            <Save size={13} /><span>Save</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Pay Rate inline-edit row ---
function PayRateRow({ rate, saving, onSave }) {
  const [val, setVal] = React.useState(rate.hourly_rate);
  const [dirty, setDirty] = React.useState(false);
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <span className="font-medium text-gray-900">{rate.position}</span>
      <div className="flex items-center space-x-2">
        <span className="text-gray-500 text-sm">$</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={val}
          onChange={e => { setVal(e.target.value); setDirty(true); }}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-red-500"
        />
        <span className="text-gray-500 text-sm">/hr</span>
        {dirty && (
          <button
            onClick={() => { onSave(rate.id, val); setDirty(false); }}
            disabled={saving}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center space-x-1"
          >
            <Save size={13} /><span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Travel Tier inline-edit row ---
function TravelTierRow({ tier, onSave }) {
  const [min, setMin] = React.useState(tier.min_miles);
  const [max, setMax] = React.useState(tier.max_miles);
  const [pay, setPay] = React.useState(tier.pay_amount);
  const [dirty, setDirty] = React.useState(false);

  const handleSave = () => {
    onSave(tier.id, 'min_miles', min);
    onSave(tier.id, 'max_miles', max);
    onSave(tier.id, 'pay_amount', pay);
    setDirty(false);
  };

  return (
    <div className="grid grid-cols-3 gap-3 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
      <input type="number" value={min} min="0"
        onChange={e => { setMin(e.target.value); setDirty(true); }}
        className="px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-red-500" />
      <input type="number" value={max} min="0"
        onChange={e => { setMax(e.target.value); setDirty(true); }}
        className="px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-red-500" />
      <div className="flex items-center space-x-2">
        <span className="text-gray-500 text-sm">$</span>
        <input type="number" value={pay} min="0"
          onChange={e => { setPay(e.target.value); setDirty(true); }}
          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:ring-2 focus:ring-red-500" />
        {dirty && (
          <button onClick={handleSave}
            className="bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700">
            <Save size={13} />
          </button>
        )}
      </div>
    </div>
  );
}



// ── Location Pay Rates Component (embedded in location card) ──
// ── Location Pay Rates (reads/writes location_pay_rates directly) ──
function LocationPayRates({ location, positions, onPayRatesChanged }) {
  const [rates, setRates] = React.useState({});
  const [loading, setLoading] = React.useState(true);

  const getPayRateKey = (position) => {
    const p = String(position || '').toLowerCase().trim();
    if (p.includes('blackjack')) return 'blackjack_dealer';
    if (p.includes('roulette')) return 'roulette_dealer';
    if (p.includes('poker')) return 'poker_dealer';
    if (p.includes('craps')) return 'craps_dealer';
    if (p.includes('baccarat')) return 'baccarat_dealer';
    if (p.includes('event lead')) return 'event_lead';
    if (p === 'dealer') return 'dealer';
    if (p.includes('host')) return 'host';
    if (p.includes('bartender')) return 'bartender';
    if (p.includes('server')) return 'server';
    if (p.includes('cashier')) return 'cashier';
    return p.replace(/\s+/g, '_');
  };

  const loadRates = async () => {
    setLoading(true);
    const { data: rData } = await supabase
      .from('location_pay_rates')
      .select('*')
      .eq('location_id', location.id);
    const rMap = {};
    (rData || []).forEach(r => { rMap[r.position] = r; });
    setRates(rMap);
    setLoading(false);
  };

  React.useEffect(() => { loadRates(); }, [location.id]);

  const saveRate = async (positionLabel, rate, existingId) => {
    const key = getPayRateKey(positionLabel);
    const numRate = parseFloat(rate);
    if (isNaN(numRate)) return;
    if (existingId) {
      await supabase.from('location_pay_rates').update({ hourly_rate: numRate }).eq('id', existingId);
    } else {
      await supabase.from('location_pay_rates').insert({ location_id: location.id, position: key, hourly_rate: numRate });
    }
    await loadRates();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  const clearRate = async (existingId) => {
    if (!existingId) return;
    await supabase.from('location_pay_rates').delete().eq('id', existingId);
    await loadRates();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  if (loading) return <p className="text-xs text-gray-400 mt-2">Loading...</p>;

  const positionLabels = positions.map(p => p.label || p);

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {positionLabels.map(pos => {
        const key = getPayRateKey(pos);
        const existing = rates[key] || rates[pos];
        return (
          <LocationRateRow
            key={pos}
            position={pos}
            existing={existing ? { id: existing.id, rate: existing.hourly_rate } : null}
            onSave={(posLabel, rate, existingId) => saveRate(posLabel, rate, existingId)}
            onClear={clearRate}
          />
        );
      })}
    </div>
  );
}

function LocationRateRow({ position, existing, onSave, onClear }) {
  const [val, setVal] = React.useState(existing?.rate ?? '');
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setVal(existing?.rate ?? '');
    setDirty(false);
  }, [existing]);

  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-100">
      <span className="text-sm text-gray-700 font-medium">{position}</span>
      <div className="flex items-center space-x-1">
        <span className="text-gray-400 text-xs">$</span>
        <input
          type="number" min="0" step="0.5"
          placeholder="base"
          value={val}
          onChange={e => { setVal(e.target.value); setDirty(true); }}
          className="w-16 px-2 py-1 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-red-500"
        />
        <span className="text-gray-400 text-xs">/hr</span>
        {dirty && val && (
          <button onClick={() => { onSave(position, val, existing?.id); setDirty(false); }}
            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
            <Save size={11} />
          </button>
        )}
        {existing?.id && !dirty && (
          <button onClick={() => { onClear(existing.id); setVal(''); }}
            className="text-gray-300 hover:text-red-400 p-1"><XCircle size={13} /></button>
        )}
      </div>
    </div>
  );
}

export default function SettingsView({
  positions,
  onUpdatePositions,
  onPayRatesChanged
}) {
  const confirm = useConfirm();
  const notify = useToast();
  const [activeTab, setActiveTab] = useState('venues');
  const [hostLabelValue, setHostLabelValue] = useState(getHostLabel());
  const [hostLabelSaved, setHostLabelSaved] = useState(false);

  const handleSaveHostLabel = () => {
    setHostLabel(hostLabelValue);
    setHostLabelSaved(true);
    setTimeout(() => setHostLabelSaved(false), 2000);
  };

  // --- Pay Rates state ---
  const [payRatesList, setPayRatesList] = useState([]);
  const [travelTiersList, setTravelTiersList] = useState([]);
  const [locationBonuses, setLocationBonuses] = useState([]);
  const [loadingPayRates, setLoadingPayRates] = useState(false);
  const [savingPayRate, setSavingPayRate] = useState(null);
  const [newLocationBonus, setNewLocationBonus] = useState({ name: '', zip: '', bonus_amount: '' });
  const [addingLocationBonus, setAddingLocationBonus] = useState(false);

  const loadPayRatesData = async () => {
    setLoadingPayRates(true);
    try {
      const [{ data: rates }, { data: tiers }, { data: bonusData }] = await Promise.all([
        supabase.from('pay_rates').select('*').order('position'),
        supabase.from('travel_tiers').select('*').order('min_miles'),
        supabase.from('bonuses').select('*'),
      ]);
      setPayRatesList(rates || []);
      setTravelTiersList(tiers || []);
      setLocationBonuses((bonusData || []).filter(b => b.zip_code));
    } catch (err) { console.error('loadPayRatesData:', err); }
    finally { setLoadingPayRates(false); }
  };

  // Helper: normalize position label to a pay_rates key (mirrors App.jsx getPayRateKey)
  const getPayRateKey = (position) => {
    const p = String(position || '').toLowerCase().trim();
    if (p.includes('blackjack')) return 'blackjack_dealer';
    if (p.includes('roulette')) return 'roulette_dealer';
    if (p.includes('poker')) return 'poker_dealer';
    if (p.includes('craps')) return 'craps_dealer';
    if (p.includes('baccarat')) return 'baccarat_dealer';
    if (p.includes('event lead')) return 'event_lead';
    if (p === 'dealer') return 'dealer';
    if (p.includes('host')) return 'host';
    if (p.includes('bartender')) return 'bartender';
    if (p.includes('server')) return 'server';
    if (p.includes('cashier')) return 'cashier';
    return p.replace(/\s+/g, '_');
  };

  // Build a map: normalizedKey → pay_rates row, for quick lookup
  const payRatesMap = {};
  payRatesList.forEach(r => {
    payRatesMap[getPayRateKey(r.position)] = r;
    payRatesMap[r.position] = r; // also allow direct match
  });

  // Save by position label — upsert if no matching row exists yet
  const savePayRateByPosition = async (positionLabel, newRate) => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) { notify('Enter a valid rate'); return; }
    const key = getPayRateKey(positionLabel);
    const existing = payRatesMap[key] || payRatesMap[positionLabel];
    if (existing) {
      await supabase.from('pay_rates').update({ hourly_rate: rate }).eq('id', existing.id);
    } else {
      // Create new row using the normalized key as position name
      await supabase.from('pay_rates').insert({ position: key, hourly_rate: rate });
    }
    loadPayRatesData();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  useEffect(() => {
    if (activeTab === 'payrates') loadPayRatesData();
  }, [activeTab]);

  const savePayRate = async (id, newRate) => {
    setSavingPayRate(id);
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0) { notify('Enter a valid rate'); setSavingPayRate(null); return; }
    await supabase.from('pay_rates').update({ hourly_rate: rate }).eq('id', id);
    setSavingPayRate(null);
    loadPayRatesData();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  const saveTravelTier = async (id, field, value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    await supabase.from('travel_tiers').update({ [field]: num }).eq('id', id);
    loadPayRatesData();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  const saveLocationBonus = async () => {
    const { name, zip, bonus_amount } = newLocationBonus;
    if (!name || !zip || !bonus_amount) { notify('Fill in all fields'); return; }
    await supabase.from('bonuses').insert({ bonus_name: name, bonus_amount: parseFloat(bonus_amount), zip_code: zip });
    setNewLocationBonus({ name: '', zip: '', bonus_amount: '' });
    setAddingLocationBonus(false);
    loadPayRatesData();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  const deleteLocationBonus = async (id) => {
    if (!(await confirm('Delete this location bonus?'))) return;
    await supabase.from('bonuses').delete().eq('id', id);
    loadPayRatesData();
    if (onPayRatesChanged) onPayRatesChanged();
  };

  // --- Locations state ---
  const [locations, setLocations] = useState([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationForm, setLocationForm] = useState({
    name: '', city: '', state: '', timezone: 'America/Chicago',
    center_zip: '', radius_miles: 30,
    rules: { default_dress_code: '', notes: '' },
    is_active: true
  });
  const [savingLocation, setSavingLocation] = useState(false);
  const [expandedLocationRates, setExpandedLocationRates] = useState(null);
  // --- Venues state ---
  const [venues, setVenues] = useState([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [venueForm, setVenueForm] = useState({
    name: '', address: '', phone: '', email: '',
    contact_name: '', parking: '', notes: '', is_active: true
  });
  const [savingVenue, setSavingVenue] = useState(false);

  // --- Clients state ---
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showAddClient, setShowAddClient] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [clientEvents, setClientEvents] = useState({});
  const [clientSearch, setClientSearch] = useState('');
  const [clientForm, setClientForm] = useState({
    name: '', company: '', phone: '', email: '', notes: '', tags: [], is_active: true
  });
  const [savingClient, setSavingClient] = useState(false);
  const [clientTagInput, setClientTagInput] = useState('');

  const [newPosition, setNewPosition] = useState('');
  const [editingPosition, setEditingPosition] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [paymentTrackingEnabled, setPaymentTrackingEnabled] = useState(true);
  const [loadingPaymentSetting, setLoadingPaymentSetting] = useState(true);
  const [rankAccessDays, setRankAccessDays] = useState({
    1: 0,   // Rank 1 sees immediately
    2: 7,   // Rank 2 sees 7 days before
    3: 10,  // Rank 3 sees 10 days before
    4: 12,  // Rank 4 sees 12 days before
    5: 14   // Rank 5 sees 14 days before
  });
  const [loadingRankAccess, setLoadingRankAccess] = useState(true);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [timeFormat, setTimeFormat] = useState('12'); // '12' or '24'
  const [loadingTimeSettings, setLoadingTimeSettings] = useState(true);

  useEffect(() => {
    loadPaymentTrackingSetting();
    loadRankAccessSettings();
    loadTimeSettings();
    loadLocations();
    loadVenues();
    loadClients();
  }, []);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');
      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error('Error loading locations:', err.message);
    } finally {
      setLoadingLocations(false);
    }
  };

  const loadVenues = async () => {
    setLoadingVenues(true);
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');
      if (error) throw error;
      setVenues(data || []);
    } catch (err) {
      console.error('Error loading venues:', err.message);
    } finally {
      setLoadingVenues(false);
    }
  };

  const resetVenueForm = () => {
    setVenueForm({ name: '', address: '', phone: '', email: '', contact_name: '', parking: '', notes: '', is_active: true });
  };

  const openAddVenue = () => {
    resetVenueForm();
    setEditingVenue(null);
    setShowAddVenue(true);
  };

  const openEditVenue = (venue) => {
    setVenueForm({
      name: venue.name || '',
      address: venue.address || '',
      phone: venue.phone || '',
      email: venue.email || '',
      contact_name: venue.contact_name || '',
      parking: venue.parking || '',
      notes: venue.notes || '',
      is_active: venue.is_active !== false
    });
    setEditingVenue(venue);
    setShowAddVenue(true);
  };

  const saveVenue = async () => {
    if (!venueForm.name.trim()) {
      notify('Venue name is required.');
      return;
    }
    setSavingVenue(true);
    try {
      const payload = {
        name: venueForm.name.trim(),
        address: venueForm.address.trim() || null,
        phone: venueForm.phone.trim() || null,
        email: venueForm.email.trim() || null,
        contact_name: venueForm.contact_name.trim() || null,
        parking: venueForm.parking.trim() || null,
        notes: venueForm.notes.trim() || null,
        is_active: venueForm.is_active
      };
      if (editingVenue) {
        const { error } = await supabase.from('venues').update(payload).eq('id', editingVenue.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('venues').insert([payload]);
        if (error) throw error;
      }
      await loadVenues();
      setShowAddVenue(false);
      setEditingVenue(null);
      resetVenueForm();
    } catch (err) {
      notify('Error saving venue: ' + err.message);
    } finally {
      setSavingVenue(false);
    }
  };

  const toggleVenueActive = async (venue) => {
    try {
      const { error } = await supabase.from('venues').update({ is_active: !venue.is_active }).eq('id', venue.id);
      if (error) throw error;
      await loadVenues();
    } catch (err) {
      notify('Error updating venue: ' + err.message);
    }
  };

  const deleteVenue = async (venue) => {
    if (!(await confirm(`Delete "${venue.name}"? This cannot be undone.`))) return;
    try {
      const { error } = await supabase.from('venues').delete().eq('id', venue.id);
      if (error) throw error;
      await loadVenues();
    } catch (err) {
      notify('Error deleting venue: ' + err.message);
    }
  };

  // --- Client functions ---
  const loadClients = async () => {
    setLoadingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Error loading clients:', err.message);
    } finally {
      setLoadingClients(false);
    }
  };

  const loadClientEvents = async (clientId) => {
    if (clientEvents[clientId]) return; // already loaded
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, name, date, venue, address, positions, status')
        .eq('client_id', clientId)
        .order('date', { ascending: false });
      if (error) throw error;
      setClientEvents(prev => ({ ...prev, [clientId]: data || [] }));
    } catch (err) {
      console.error('Error loading client events:', err.message);
    }
  };

  const resetClientForm = () => {
    setClientForm({ name: '', company: '', phone: '', email: '', notes: '', tags: [], is_active: true });
    setClientTagInput('');
  };

  const openAddClient = () => {
    resetClientForm();
    setEditingClient(null);
    setShowAddClient(true);
  };

  const openEditClient = (client) => {
    setClientForm({
      name: client.name || '',
      company: client.company || '',
      phone: client.phone || '',
      email: client.email || '',
      notes: client.notes || '',
      tags: client.tags || [],
      is_active: client.is_active !== false
    });
    setClientTagInput('');
    setEditingClient(client);
    setShowAddClient(true);
  };

  const saveClient = async () => {
    if (!clientForm.name.trim()) { notify('Client name is required.'); return; }
    setSavingClient(true);
    try {
      const payload = {
        name: clientForm.name.trim(),
        company: clientForm.company.trim() || null,
        phone: clientForm.phone.trim() || null,
        email: clientForm.email.trim() || null,
        notes: clientForm.notes.trim() || null,
        tags: clientForm.tags,
        is_active: clientForm.is_active
      };
      if (editingClient) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([payload]);
        if (error) throw error;
      }
      await loadClients();
      setShowAddClient(false);
      setEditingClient(null);
      resetClientForm();
    } catch (err) {
      notify('Error saving client: ' + err.message);
    } finally {
      setSavingClient(false);
    }
  };

  const deleteClient = async (client) => {
    if (!(await confirm(`Delete "${client.name}"? Their events will not be deleted.`))) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;
      await loadClients();
    } catch (err) {
      notify('Error deleting client: ' + err.message);
    }
  };

  const addClientTag = () => {
    const tag = clientTagInput.trim();
    if (tag && !clientForm.tags.includes(tag)) {
      setClientForm(f => ({ ...f, tags: [...f.tags, tag] }));
    }
    setClientTagInput('');
  };

  const removeClientTag = (tag) => {
    setClientForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  const getClientStats = (clientId) => {
    const events = clientEvents[clientId] || [];
    const total = events.length;
    const lastEvent = events[0];
    return { total, lastEvent };
  };

  const resetLocationForm = () => {
    setLocationForm({
      name: '', city: '', state: '', timezone: 'America/Chicago',
      address: '',
      center_zip: '', radius_miles: 30,
      service_radius_miles: 50,
      rules: { default_dress_code: '', notes: '' },
      is_active: true
    });
  };

  const openAddLocation = () => {
    resetLocationForm();
    setEditingLocation(null);
    setShowAddLocation(true);
  };

  const openEditLocation = (loc) => {
    setLocationForm({
      name: loc.name || '',
      city: loc.city || '',
      state: loc.state || '',
      timezone: loc.timezone || 'America/Chicago',
      address: loc.address || '',
      center_zip: loc.center_zip || '',
      radius_miles: loc.radius_miles || 30,
      service_radius_miles: loc.service_radius_miles || 50,
      rules: {
        default_dress_code: loc.rules?.default_dress_code || '',
        notes: loc.rules?.notes || ''
      },
      is_active: loc.is_active !== false
    });
    setEditingLocation(loc);
    setShowAddLocation(true);
  };

  const saveLocation = async () => {
    if (!locationForm.name.trim()) {
      notify('Location name is required.');
      return;
    }
    setSavingLocation(true);
    try {
      const payload = {
        name: locationForm.name.trim(),
        city: locationForm.city.trim() || null,
        state: locationForm.state.trim() || null,
        timezone: locationForm.timezone,
        address: locationForm.address.trim() || null,
        center_zip: locationForm.center_zip.trim() || null,
        radius_miles: Number(locationForm.radius_miles) || 30,
        service_radius_miles: Number(locationForm.service_radius_miles) || 50,
        rules: locationForm.rules,
        is_active: locationForm.is_active
      };

      if (editingLocation) {
        const { error } = await supabase.from('locations').update(payload).eq('id', editingLocation.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('locations').insert([payload]);
        if (error) throw error;
      }

      await loadLocations();
      setShowAddLocation(false);
      setEditingLocation(null);
      resetLocationForm();
      if (onPayRatesChanged) onPayRatesChanged();
    } catch (err) {
      notify('Error saving location: ' + err.message);
    } finally {
      setSavingLocation(false);
    }
  };

  const toggleLocationActive = async (loc) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_active: !loc.is_active })
        .eq('id', loc.id);
      if (error) throw error;
      await loadLocations();
    } catch (err) {
      notify('Error updating location: ' + err.message);
    }
  };

  const deleteLocation = async (loc) => {
    if (loc.name === 'Main') {
      notify('The default "Main" location cannot be deleted.');
      return;
    }
    if (!(await confirm(`Delete "${loc.name}"? This cannot be undone. Events linked to this location will lose their location.`))) return;
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', loc.id);
      if (error) throw error;
      await loadLocations();
    } catch (err) {
      notify('Error deleting location: ' + err.message);
    }
  };




  const loadPaymentTrackingSetting = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'payment_tracking_enabled')
        .single();
      
      if (!error && data) {
        setPaymentTrackingEnabled(data.setting_value === 'true' || data.setting_value === true);
      } else {
        // Default to enabled
        setPaymentTrackingEnabled(true);
      }
    } catch (error) {
      setPaymentTrackingEnabled(true);
    } finally {
      setLoadingPaymentSetting(false);
    }
  };

  const togglePaymentTracking = async (enabled) => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'payment_tracking_enabled')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: enabled.toString(),
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'payment_tracking_enabled');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'payment_tracking_enabled',
            setting_value: enabled.toString()
          }]);
        
        if (error) throw error;
      }

      setPaymentTrackingEnabled(enabled);
      notify(enabled ? 'Payment tracking enabled!' : 'Payment tracking disabled!');
    } catch (error) {
      notify('Error saving setting: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const loadRankAccessSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'rank_access_days')
        .single();
      
      if (!error && data && data.setting_value) {
        setRankAccessDays(JSON.parse(data.setting_value));
      }
    } catch (error) {
    } finally {
      setLoadingRankAccess(false);
    }
  };

  const saveRankAccessSettings = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'rank_access_days')
        .single();

      if (existing) {
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: JSON.stringify(rankAccessDays),
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'rank_access_days');
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'rank_access_days',
            setting_value: JSON.stringify(rankAccessDays)
          }]);
        
        if (error) throw error;
      }

    } catch (error) {
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const loadTimeSettings = async () => {
    try {
      // Load timezone
      const { data: tzData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();
      
      if (tzData) {
        setTimezone(tzData.setting_value || 'America/Chicago');
      }

      // Load time format
      const { data: formatData } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();
      
      if (formatData) {
        setTimeFormat(formatData.setting_value || '12');
      }
    } catch (error) {
    } finally {
      setLoadingTimeSettings(false);
    }
  };

  const saveTimeSettings = async () => {
    setSaving(true);
    try {
      // Save timezone
      const { data: existingTz } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'timezone')
        .single();

      if (existingTz) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timezone,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'timezone');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'timezone',
            setting_value: timezone
          }]);
      }

      // Save time format
      const { data: existingFormat } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'time_format')
        .single();

      if (existingFormat) {
        await supabase
          .from('settings')
          .update({ 
            setting_value: timeFormat,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'time_format');
      } else {
        await supabase
          .from('settings')
          .insert([{
            setting_key: 'time_format',
            setting_value: timeFormat
          }]);
      }

    } catch (error) {
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const savePositions = async (updatedPositions) => {
    setSaving(true);
    try {
      // Sort alphabetically by label
      const sortedPositions = [...updatedPositions].sort((a, b) => {
        const labelA = a.label || a;
        const labelB = b.label || b;
        return labelA.localeCompare(labelB);
      });
      
      // Check if settings exist
      const { data: existingSettings } = await supabase
        .from('settings')
        .select('*')
        .eq('setting_key', 'positions')
        .single();

      if (existingSettings) {
        // Update existing
        const { error } = await supabase
          .from('settings')
          .update({ 
            setting_value: sortedPositions,
            updated_at: new Date().toISOString()
          })
          .eq('setting_key', 'positions');
        
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('settings')
          .insert([{
            setting_key: 'positions',
            setting_value: sortedPositions
          }]);
        
        if (error) throw error;
      }

      onUpdatePositions(sortedPositions);
      notify('Positions updated successfully!');
    } catch (error) {
      notify('Error saving positions: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPosition = async () => {
    if (!newPosition.trim()) {
      notify('Please enter a position name');
      return;
    }
    
    const newKey = newPosition.trim().toLowerCase().replace(/\s+/g, '_');
    const newLabel = newPosition.trim();
    
    if (positions.some(p => p.key === newKey)) {
      notify('This position already exists');
      return;
    }
    
    const updatedPositions = [...positions, { key: newKey, label: newLabel }];
    await savePositions(updatedPositions);
    setNewPosition('');
  };

  const handleDeletePosition = async (position) => {
    const label = position.label || position;
    if (!(await confirm(`Are you sure you want to delete "${label}"?`))) return;
    
    const posKey = position.key || position;
    const updatedPositions = positions.filter(p => p.key !== posKey);
    await savePositions(updatedPositions);
  };

  const handleEditPosition = (position) => {
    setEditingPosition(position.key || position);
    setEditValue(position.label || position);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) {
      notify('Position name cannot be empty');
      return;
    }
    
    const newLabel = editValue.trim();
    
    const updatedPositions = positions.map(p => {
      if (p.key === editingPosition) {
        return { ...p, label: newLabel };
      }
      return p;
    });
    
    await savePositions(updatedPositions);
    setEditingPosition(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingPosition(null);
    setEditValue('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-600 mt-1">Manage locations, positions, and system settings</p>
      </div>

      {/* Tab Bar */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-full overflow-x-auto">
        {[
          { id: 'venues', label: '🏛️ Venues' },
          { id: 'clients', label: '👥 Clients' },
          { id: 'locations', label: '📍 Locations' },
          { id: 'positions', label: '🎰 Positions' },
          { id: 'payrates', label: '💰 Pay Rates' },
          { id: 'general', label: '⚙️ System' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white shadow text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CLIENTS TAB ── */}
      {activeTab === 'clients' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Clients</h3>
              <p className="text-sm text-gray-500 mt-0.5">Manage client profiles, view event history, and auto-fill event details</p>
            </div>
            <button
              onClick={openAddClient}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={16} />
              <span>Add Client</span>
            </button>
          </div>

          {/* Search */}
          {clients.length > 3 && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Search clients..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
              />
            </div>
          )}

          {/* Add / Edit Form */}
          {showAddClient && (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingClient ? `Edit: ${editingClient.name}` : 'New Client'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Client Name *</label>
                  <input type="text" value={clientForm.name}
                    onChange={e => setClientForm({ ...clientForm, name: e.target.value })}
                    placeholder="e.g. John Smith / ABC Corp"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Company</label>
                  <input type="text" value={clientForm.company}
                    onChange={e => setClientForm({ ...clientForm, company: e.target.value })}
                    placeholder="e.g. ABC Corporation"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input type="text" value={clientForm.phone}
                    onChange={e => setClientForm({ ...clientForm, phone: e.target.value })}
                    placeholder="(414) 555-0100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                  <input type="email" value={clientForm.email}
                    onChange={e => setClientForm({ ...clientForm, email: e.target.value })}
                    placeholder="client@company.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tags</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {clientForm.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center space-x-1 bg-red-50 text-red-800 text-xs px-2 py-1 rounded-full border border-red-200">
                        <span>{tag}</span>
                        <button onClick={() => removeClientTag(tag)} className="hover:text-red-600 ml-1">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input type="text" value={clientTagInput}
                      onChange={e => setClientTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addClientTag())}
                      placeholder="e.g. Corporate, Fundraiser, Repeat"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    />
                    <button onClick={addClientTag} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">
                      + Add
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea value={clientForm.notes}
                    onChange={e => setClientForm({ ...clientForm, notes: e.target.value })}
                    placeholder="Preferences, special requirements, how you met them, etc."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button onClick={saveClient} disabled={savingClient}
                  className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm"
                >
                  <Save size={15} />
                  <span>{savingClient ? 'Saving...' : editingClient ? 'Save Changes' : 'Create Client'}</span>
                </button>
                <button onClick={() => { setShowAddClient(false); setEditingClient(null); resetClientForm(); }}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Client List */}
          {loadingClients ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900" />
            </div>
          ) : clients.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <User size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No clients yet.</p>
              <p className="text-gray-400 text-sm mt-1">Run the migration SQL first to auto-import clients from your existing events.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clients
                .filter(c => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || c.company?.toLowerCase().includes(clientSearch.toLowerCase()))
                .map(client => {
                  const isExpanded = expandedClient === client.id;
                  const events = clientEvents[client.id] || [];
                  const stats = getClientStats(client.id);

                  return (
                    <div key={client.id} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
                      {/* Client Card Header */}
                      <div className="p-4 flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1 min-w-0">
                          <div className="bg-red-900 rounded-full h-10 w-10 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                              <h4 className="font-bold text-gray-900">{client.name}</h4>
                              {client.company && <span className="text-sm text-gray-500">— {client.company}</span>}
                              {!client.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                              {client.phone && <span className="flex items-center space-x-1"><Phone size={11} /><span>{client.phone}</span></span>}
                              {client.email && <span className="flex items-center space-x-1"><Mail size={11} /><span>{client.email}</span></span>}
                            </div>
                            {client.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {client.tags.map(tag => (
                                  <span key={tag} className="bg-red-50 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-100">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                          <button
                            onClick={() => {
                              if (!isExpanded) loadClientEvents(client.id);
                              setExpandedClient(isExpanded ? null : client.id);
                            }}
                            className="flex items-center space-x-1 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                            <Calendar size={13} />
                            <span>History</span>
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button onClick={() => openEditClient(client)} className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                            <Edit size={15} />
                          </button>
                          <button onClick={() => deleteClient(client)} className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Notes preview */}
                      {client.notes && !isExpanded && (
                        <div className="px-4 pb-3 ml-13">
                          <p className="text-xs text-gray-400 italic ml-13">"{client.notes}"</p>
                        </div>
                      )}

                      {/* Expanded: Event History */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                          {client.notes && (
                            <p className="text-xs text-gray-500 italic mb-3 pb-3 border-b border-gray-200">"{client.notes}"</p>
                          )}
                          <p className="text-xs font-semibold text-gray-700 mb-3 flex items-center space-x-1">
                            <Calendar size={13} />
                            <span>Event History</span>
                            {events.length > 0 && <span className="bg-red-900 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">{events.length}</span>}
                          </p>
                          {events.length === 0 ? (
                            <p className="text-xs text-gray-400 py-2">No linked events yet. Events are linked via the client_id field after running the migration.</p>
                          ) : (
                            <div className="space-y-2">
                              {events.map(ev => {
                                const totalStaff = Array.isArray(ev.positions) ? ev.positions.reduce((sum, p) => sum + (p.count || 0), 0) : 0;
                                return (
                                  <div key={ev.id} className="bg-white rounded-lg p-3 border border-gray-200 flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">{ev.name}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        {ev.venue && ` · ${ev.venue}`}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-3">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        ev.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        ev.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>{ev.status}</span>
                                      {totalStaff > 0 && <p className="text-xs text-gray-400 mt-1">{totalStaff} staff</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── VENUES TAB ── */}
      {activeTab === 'venues' && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Venues</h3>
              <p className="text-sm text-gray-500 mt-0.5">Save recurring venues so you can auto-fill event details</p>
            </div>
            <button
              onClick={openAddVenue}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={16} />
              <span>Add Venue</span>
            </button>
          </div>

          {/* Add / Edit Form */}
          {showAddVenue && (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingVenue ? `Edit: ${editingVenue.name}` : 'New Venue'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Venue Name *</label>
                  <input
                    type="text"
                    value={venueForm.name}
                    onChange={e => setVenueForm({ ...venueForm, name: e.target.value })}
                    placeholder="e.g. Grand Milwaukee Hotel"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
                  <AddressAutocomplete
                    value={venueForm.address}
                    onChange={val => setVenueForm({ ...venueForm, address: val })}
                    placeholder="123 Main St, Milwaukee, WI 53202"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={venueForm.contact_name}
                    onChange={e => setVenueForm({ ...venueForm, contact_name: e.target.value })}
                    placeholder="e.g. Jane Smith"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={venueForm.phone}
                    onChange={e => setVenueForm({ ...venueForm, phone: e.target.value })}
                    placeholder="(414) 555-0100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={venueForm.email}
                    onChange={e => setVenueForm({ ...venueForm, email: e.target.value })}
                    placeholder="events@venue.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Parking Info</label>
                  <input
                    type="text"
                    value={venueForm.parking}
                    onChange={e => setVenueForm({ ...venueForm, parking: e.target.value })}
                    placeholder="e.g. Free parking in rear lot"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={venueForm.notes}
                    onChange={e => setVenueForm({ ...venueForm, notes: e.target.value })}
                    placeholder="Loading dock location, check-in procedure, AV contacts, etc."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={saveVenue}
                  disabled={savingVenue}
                  className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm"
                >
                  <Save size={15} />
                  <span>{savingVenue ? 'Saving...' : editingVenue ? 'Save Changes' : 'Create Venue'}</span>
                </button>
                <button
                  onClick={() => { setShowAddVenue(false); setEditingVenue(null); resetVenueForm(); }}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Venue Cards */}
          {loadingVenues ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900"></div>
            </div>
          ) : venues.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Building2 size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No venues saved yet.</p>
              <p className="text-gray-400 text-sm mt-1">Add your first venue to start auto-filling event details.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venues.map(venue => (
                <div
                  key={venue.id}
                  className={`bg-white rounded-lg shadow p-5 border-l-4 ${venue.is_active ? 'border-red-900' : 'border-gray-300'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Building2 size={16} className={venue.is_active ? 'text-red-900' : 'text-gray-400'} />
                      <h4 className="font-bold text-gray-900">{venue.name}</h4>
                      {!venue.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditVenue(venue)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => toggleVenueActive(venue)}
                        className={`p-2 rounded transition-colors ${venue.is_active ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={venue.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {venue.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                      <button
                        onClick={() => deleteVenue(venue)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    {venue.address && (
                      <div className="flex items-start space-x-2">
                        <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>{venue.address}</span>
                      </div>
                    )}
                    {venue.contact_name && (
                      <div className="flex items-center space-x-2">
                        <User size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.contact_name}</span>
                      </div>
                    )}
                    {venue.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.phone}</span>
                      </div>
                    )}
                    {venue.email && (
                      <div className="flex items-center space-x-2">
                        <Mail size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.email}</span>
                      </div>
                    )}
                    {venue.parking && (
                      <div className="flex items-center space-x-2">
                        <ParkingCircle size={13} className="text-gray-400 flex-shrink-0" />
                        <span>{venue.parking}</span>
                      </div>
                    )}
                    {venue.notes && (
                      <p className="text-gray-400 italic text-xs mt-1 pt-1 border-t border-gray-100">"{venue.notes}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LOCATIONS TAB ── */}
      {activeTab === 'locations' && (
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Locations</h3>
              <p className="text-sm text-gray-500 mt-0.5">Manage the markets your business operates in</p>
            </div>
            <button
              onClick={openAddLocation}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 flex items-center space-x-2 text-sm"
            >
              <Plus size={16} />
              <span>Add Location</span>
            </button>
          </div>

          {/* Add / Edit Form */}
          {showAddLocation && (
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-900">
              <h4 className="text-lg font-bold text-gray-900 mb-4">
                {editingLocation ? `Edit: ${editingLocation.name}` : 'New Location'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Location Name *</label>
                  <input
                    type="text"
                    value={locationForm.name}
                    onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                    placeholder="e.g. Milwaukee, Chicago North"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Timezone</label>
                  <select
                    value={locationForm.timezone}
                    onChange={e => setLocationForm({ ...locationForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                    <option value="America/Anchorage">Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii (HST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={locationForm.city}
                    onChange={e => setLocationForm({ ...locationForm, city: e.target.value })}
                    placeholder="e.g. Milwaukee"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={locationForm.state}
                    onChange={e => setLocationForm({ ...locationForm, state: e.target.value })}
                    placeholder="e.g. WI"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Warehouse / Hub Address</label>
                  <input
                    type="text"
                    value={locationForm.address}
                    onChange={e => setLocationForm({ ...locationForm, address: e.target.value })}
                    placeholder="e.g. 535 S 93rd St, Milwaukee, WI 53214"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Used as the travel origin when calculating worker travel pay for events in this location.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Center Zip Code</label>
                  <input
                    type="text"
                    value={locationForm.center_zip}
                    onChange={e => setLocationForm({ ...locationForm, center_zip: e.target.value })}
                    placeholder="e.g. 53214"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Geographic center of this location's service area</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Service Radius (miles)</label>
                  <input
                    type="number"
                    value={locationForm.service_radius_miles}
                    onChange={e => setLocationForm({ ...locationForm, service_radius_miles: e.target.value })}
                    placeholder="50"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Events within this radius are considered part of this location</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Default Dress Code</label>
                  <input
                    type="text"
                    value={locationForm.rules.default_dress_code}
                    onChange={e => setLocationForm({ ...locationForm, rules: { ...locationForm.rules, default_dress_code: e.target.value } })}
                    placeholder="e.g. Vegas on Wheels attire"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Active</label>
                  <div className="flex items-center space-x-3 mt-2">
                    <button
                      onClick={() => setLocationForm({ ...locationForm, is_active: !locationForm.is_active })}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${locationForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${locationForm.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-gray-600">{locationForm.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={locationForm.rules.notes}
                    onChange={e => setLocationForm({ ...locationForm, rules: { ...locationForm.rules, notes: e.target.value } })}
                    placeholder="Any location-specific notes for admin reference..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={saveLocation}
                  disabled={savingLocation}
                  className="bg-red-900 text-white px-5 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2 text-sm"
                >
                  <Save size={15} />
                  <span>{savingLocation ? 'Saving...' : editingLocation ? 'Save Changes' : 'Create Location'}</span>
                </button>
                <button
                  onClick={() => { setShowAddLocation(false); setEditingLocation(null); resetLocationForm(); }}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Location Cards */}
          {loadingLocations ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-900"></div>
            </div>
          ) : locations.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No locations yet. Add your first location above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {locations.map(loc => (
                <div
                  key={loc.id}
                  className={`bg-white rounded-lg shadow p-5 border-l-4 ${loc.is_active ? 'border-green-500' : 'border-gray-300'}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className={loc.is_active ? 'text-green-600' : 'text-gray-400'} />
                        <h4 className="font-bold text-gray-900 text-lg">{loc.name}</h4>
                        {!loc.is_active && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      {(loc.city || loc.state) && (
                        <p className="text-sm text-gray-500 mt-0.5 ml-6">
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => openEditLocation(loc)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => toggleLocationActive(loc)}
                        className={`p-2 rounded transition-colors ${loc.is_active ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                        title={loc.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {loc.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                      {loc.name !== 'Main' && (
                        <button
                          onClick={() => deleteLocation(loc)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="ml-6 space-y-1 text-xs text-gray-500">
                    <p>🕐 {loc.timezone}</p>
                    {loc.address && (
                      <p>🏭 {loc.address}</p>
                    )}
                    {loc.center_zip && (
                      <p>📍 Zip {loc.center_zip} · {loc.service_radius_miles || 50} mi service radius</p>
                    )}
                    {loc.rules?.default_dress_code && (
                      <p>👔 {loc.rules.default_dress_code}</p>
                    )}
                    {loc.rules?.notes && (
                      <p className="text-gray-400 italic">"{loc.rules.notes}"</p>
                    )}
                  </div>

                  {/* Pay Rate Overrides expansion */}
                  <div className="mt-3 ml-6">
                    <button
                      onClick={() => setExpandedLocationRates(expandedLocationRates === loc.id ? null : loc.id)}
                      className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <DollarSign size={12} />
                      <span>Pay Rate Overrides</span>
                      {expandedLocationRates === loc.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {expandedLocationRates === loc.id && (
                      <LocationPayRates
                        location={loc}
                        positions={positions}
                        onPayRatesChanged={onPayRatesChanged}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* ── SYSTEM TAB ── */}
      {activeTab === 'general' && (
        <div className="space-y-0 bg-white rounded-lg shadow overflow-hidden">

          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900">System Settings</h3>
            <p className="text-sm text-gray-500 mt-0.5">Configure app-wide preferences. Click Save All at the bottom when done.</p>
          </div>

          {/* Team Leader Label */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Team Leader Label</p>
                <p className="text-xs text-gray-500 mt-0.5">What do you call your event hosts / team leaders? Appears on worker badges, filters, and reports.</p>
              </div>
              <input
                type="text"
                value={hostLabelValue}
                onChange={e => setHostLabelValue(e.target.value)}
                placeholder="e.g. Host, Pit Boss"
                className="w-48 flex-shrink-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                maxLength={30}
              />
            </div>
          </div>

          {/* Payment Tracking */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Payment Tracking</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {paymentTrackingEnabled ? 'Workers can see pay info on their assignments.' : 'Payment info is hidden from workers.'}
                </p>
              </div>
              {loadingPaymentSetting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
              ) : (
                <button
                  onClick={() => setPaymentTrackingEnabled(!paymentTrackingEnabled)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors flex-shrink-0 ${paymentTrackingEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${paymentTrackingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              )}
            </div>
          </div>

          {/* Time & Date */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm mb-3">Time & Date</p>
            {loadingTimeSettings ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
            ) : (
              <div className="flex flex-wrap gap-6">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                    disabled={saving}
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Phoenix">Arizona (MST)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                    <option value="America/Anchorage">Alaska (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii (HST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Time Format</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer text-sm">
                      <input type="radio" value="12" checked={timeFormat === '12'} onChange={(e) => setTimeFormat(e.target.value)} disabled={saving} className="w-4 h-4 text-red-900" />
                      <span>12-hour (2:30 PM)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer text-sm">
                      <input type="radio" value="24" checked={timeFormat === '24'} onChange={(e) => setTimeFormat(e.target.value)} disabled={saving} className="w-4 h-4 text-red-900" />
                      <span>24-hour (14:30)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Rank-Based Event Access */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm mb-1">Worker Event Access (Rank-Based)</p>
            <p className="text-xs text-gray-500 mb-5">Set how many days before an event each rank can see and sign up. Rank 1 (most experienced) always gets first access.</p>
            {loadingRankAccess ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900" />
            ) : (() => {
              const rankColors = ['bg-red-900','bg-red-700','bg-orange-400','bg-yellow-500','bg-gray-400'];
              const rankLabels = ['Rank 1','Rank 2','Rank 3','Rank 4','Rank 5'];
              const maxDays = Math.max(...Object.values(rankAccessDays), 1);

              return (
                <div className="space-y-5">
                  {/* Inputs row */}
                  <div className="grid grid-cols-5 gap-3">
                    {[1,2,3,4,5].map(rank => (
                      <div key={rank} className="text-center">
                        <div className={`${rankColors[rank-1]} rounded-full h-7 w-7 mx-auto flex items-center justify-center text-white text-xs font-bold mb-2`}>{rank}</div>
                        <input
                          type="number"
                          min="0"
                          value={rankAccessDays[rank]}
                          onChange={(e) => setRankAccessDays({ ...rankAccessDays, [rank]: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-center text-sm bg-white focus:ring-2 focus:ring-red-500"
                          disabled={saving}
                        />
                        <p className="text-xs text-gray-400 mt-1">days before</p>
                      </div>
                    ))}
                  </div>

                  {/* Visual Timeline */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                      <span className="font-medium text-gray-500">← Event posted</span>
                      <span className="font-medium text-gray-500">Event day →</span>
                    </div>
                    {/* Timeline bar */}
                    <div className="relative h-3 bg-gray-200 rounded-full mb-4">
                      {[1,2,3,4,5].map(rank => {
                        const days = rankAccessDays[rank];
                        const pct = days === 0 ? 0 : Math.min((days / maxDays) * 90, 90);
                        const leftPct = 100 - pct;
                        return (
                          <div
                            key={rank}
                            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white ${rankColors[rank-1]} flex items-center justify-center text-white font-bold shadow`}
                            style={{ left: `${leftPct}%`, transform: 'translate(-50%, -50%)', fontSize: '9px' }}
                            title={`Rank ${rank}: ${days === 0 ? 'immediately' : `${days} days before`}`}
                          >
                            {rank}
                          </div>
                        );
                      })}
                    </div>
                    {/* Legend */}
                    <div className="space-y-1.5">
                      {[1,2,3,4,5].map(rank => {
                        const days = rankAccessDays[rank];
                        return (
                          <div key={rank} className="flex items-center space-x-2 text-xs">
                            <div className={`${rankColors[rank-1]} rounded-full h-4 w-4 flex items-center justify-center text-white font-bold flex-shrink-0`} style={{fontSize:'8px'}}>{rank}</div>
                            <span className="text-gray-700 font-medium">{rankLabels[rank-1]}</span>
                            <span className="text-gray-400">—</span>
                            <span className="text-gray-600">
                              {days === 0
                                ? 'Sees event immediately when posted'
                                : `Unlocks ${days} day${days !== 1 ? 's' : ''} before the event`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Save All Button */}
          <div className="px-6 py-5 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-400">Changes won't apply until saved.</p>
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  setHostLabel(hostLabelValue);
                  await saveRankAccessSettings();
                  await saveTimeSettings();
                  const { data: existingPmt } = await supabase.from('settings').select('*').eq('setting_key', 'payment_tracking_enabled').single();
                  if (existingPmt) {
                    await supabase.from('settings').update({ setting_value: paymentTrackingEnabled.toString(), updated_at: new Date().toISOString() }).eq('setting_key', 'payment_tracking_enabled');
                  } else {
                    await supabase.from('settings').insert([{ setting_key: 'payment_tracking_enabled', setting_value: paymentTrackingEnabled.toString() }]);
                  }
                  notify('All settings saved!');
                } catch (err) {
                  notify('Error saving: ' + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="bg-red-900 text-white px-8 py-2.5 rounded-lg hover:bg-red-800 disabled:bg-gray-400 font-medium text-sm"
            >
              {saving ? 'Saving...' : '💾 Save All Settings'}
            </button>
          </div>

        </div>
      )}


      {/* ── POSITIONS TAB ── */}

      {/* ── PAY RATES TAB ── */}
      {activeTab === 'payrates' && (
        <div className="space-y-6">

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start space-x-2">
            <span className="text-blue-500 mt-0.5">💡</span>
            <p className="text-sm text-blue-800">These are your <strong>base rates</strong> — used when no location-specific override applies. To set per-location rates, go to the <strong>Locations tab</strong> and expand any location's Pay Rate Overrides.</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-2 mb-1">
              <DollarSign size={20} className="text-red-900" />
              <h3 className="text-xl font-bold text-gray-900">Position Hourly Rates</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Base pay per hour for each dealer/staff position.</p>
            {loadingPayRates ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : (
              <div className="space-y-2">
                {positions.map(pos => {
                  const label = pos.label || pos;
                  const key = getPayRateKey(label);
                  const existing = payRatesMap[key] || payRatesMap[label];
                  return (
                    <PositionRateRow
                      key={label}
                      label={label}
                      currentRate={existing?.hourly_rate ?? ''}
                      onSave={(rate) => savePayRateByPosition(label, rate)}
                    />
                  );
                })}
                {positions.length === 0 && <p className="text-sm text-gray-400">No positions configured. Add positions in the Positions tab first.</p>}
              </div>
            )}
          </div>

          {/* Travel Pay Tiers */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xl">🚗</span>
              <h3 className="text-xl font-bold text-gray-900">Travel Pay Tiers</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Flat travel bonus based on one-way miles from warehouse to event.</p>
            {loadingPayRates ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-gray-500 uppercase px-3 mb-1">
                  <span>Min Miles</span><span>Max Miles</span><span>Flat Pay ($)</span>
                </div>
                {travelTiersList.map(tier => (
                  <TravelTierRow key={tier.id} tier={tier} onSave={saveTravelTier} />
                ))}
                {travelTiersList.length === 0 && <p className="text-sm text-gray-400">No travel tiers configured.</p>}
              </div>
            )}
          </div>

          {/* Location Bonuses */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <MapPin size={20} className="text-red-900" />
                <h3 className="text-xl font-bold text-gray-900">Location Bonuses</h3>
              </div>
              <button
                onClick={() => setAddingLocationBonus(true)}
                className="flex items-center space-x-1 bg-red-900 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-800"
              >
                <Plus size={15} /><span>Add</span>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Extra flat bonus for events at specific zip codes (e.g. Lake Geneva 53147 = +$15).</p>
            {addingLocationBonus && (
              <div className="grid grid-cols-3 gap-2 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <input type="text" placeholder="Name (e.g. Lake Geneva)" value={newLocationBonus.name}
                  onChange={e => setNewLocationBonus(p => ({...p, name: e.target.value}))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm" />
                <input type="text" placeholder="Zip code (e.g. 53147)" value={newLocationBonus.zip}
                  onChange={e => setNewLocationBonus(p => ({...p, zip: e.target.value}))}
                  className="px-3 py-2 border border-gray-300 rounded text-sm" />
                <div className="flex space-x-2">
                  <input type="number" placeholder="Bonus $" value={newLocationBonus.bonus_amount}
                    onChange={e => setNewLocationBonus(p => ({...p, bonus_amount: e.target.value}))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm" />
                  <button onClick={saveLocationBonus} className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700"><Save size={15} /></button>
                  <button onClick={() => setAddingLocationBonus(false)} className="text-gray-500 px-2 hover:text-gray-700"><XCircle size={18} /></button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {locationBonuses.map(bonus => (
                <div key={bonus.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <span className="font-medium text-gray-900">{bonus.bonus_name}</span>
                    <span className="ml-2 text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">zip {bonus.zip_code}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-green-700">+${bonus.bonus_amount}</span>
                    <button onClick={() => deleteLocationBonus(bonus.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {locationBonuses.length === 0 && !addingLocationBonus && (
                <p className="text-sm text-gray-400">No location bonuses configured. The Lake Geneva bonus is handled separately in the bonuses table.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'positions' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Position Types</h3>
          <p className="text-sm text-gray-600 mb-4">
            Customize the positions available in your system. These are used for event staffing, worker skills, and assignment matching.
          </p>
          <p className="text-sm text-blue-600 bg-blue-50 p-3 rounded mb-6">
            💡 Adding a new position like "Baccarat Dealer" immediately makes it available as both an event position and a worker skill.
          </p>

          {/* Add New Position */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Add New Position</label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newPosition}
                onChange={(e) => setNewPosition(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddPosition()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="e.g., Baccarat Dealer"
                disabled={saving}
              />
              <button
                onClick={handleAddPosition}
                disabled={saving}
                className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 flex items-center space-x-2"
              >
                <Plus size={18} />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Existing Positions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Current Positions ({positions.length})</label>
            <div className="space-y-2">
              {positions.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">No positions configured yet.</p>
              ) : (
                positions.map((position, idx) => {
                  const posLabel = position.label || position;
                  const posKey = position.key || position.toLowerCase().replace(/\s+/g, '_');
                  const isEditing = editingPosition === posKey;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                            className="flex-1 px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-red-500"
                            autoFocus
                          />
                          <div className="flex space-x-2 ml-3">
                            <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"><CheckCircle size={20} /></button>
                            <button onClick={handleCancelEdit} className="text-gray-600 hover:text-gray-800 p-1 hover:bg-gray-200 rounded"><XCircle size={20} /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-gray-900">{posLabel}</span>
                          <div className="flex space-x-2">
                            <button onClick={() => handleEditPosition(position)} className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded"><Edit size={18} /></button>
                            <button onClick={() => handleDeletePosition(position)} className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"><Trash2 size={18} /></button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
