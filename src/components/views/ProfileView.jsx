import React, { useState, useEffect } from 'react';
import { Mail, Phone, User, Award, Calendar, Briefcase, MapPin, Shirt, Edit2, Save, X, Camera, Upload, Star, TrendingUp, TrendingDown, Minus, FileDown, Navigation } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { getPositionLabel } from '../../utils/positionHelpers';

export default function ProfileView({ worker, onProfileUpdate, assignments = [], events = [] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reliabilityLog, setReliabilityLog] = useState([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [loadingLog, setLoadingLog] = useState(false);
  const [editData, setEditData] = useState({
    email: worker?.email || '',
    phone: worker?.phone || '',
    address: worker?.address || '',
    shirt_size: worker?.shirt_size || ''
  });

  // Reminder preferences
  const [reminderPrefs, setReminderPrefs] = useState({
    email_96h: true, email_48h: true, email_24h: true, email_4h: true,
  });
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (worker?.id) {
      loadReliabilityLog();
      loadReminderPrefs();
    }
  }, [worker?.id]);

  const loadReminderPrefs = async () => {
    try {
      const { data } = await supabase
        .from('worker_reminder_prefs')
        .select('*')
        .eq('worker_id', worker.id)
        .maybeSingle();
      if (data) {
        setReminderPrefs({
          email_96h: data.email_96h !== false,
          email_48h: data.email_48h !== false,
          email_24h: data.email_24h !== false,
          email_4h:  data.email_4h  !== false,
        });
      }
      setReminderPrefsLoaded(true);
    } catch (e) {
      setReminderPrefsLoaded(true);
    }
  };

  const saveReminderPrefs = async (newPrefs) => {
    setSavingPrefs(true);
    try {
      await supabase.from('worker_reminder_prefs').upsert(
        { worker_id: worker.id, ...newPrefs, updated_at: new Date().toISOString() },
        { onConflict: 'worker_id' }
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const toggleReminder = async (key) => {
    const updated = { ...reminderPrefs, [key]: !reminderPrefs[key] };
    setReminderPrefs(updated);
    await saveReminderPrefs(updated);
  };

  const loadReliabilityLog = async () => {
    setLoadingLog(true);
    try {
      const { data, error } = await supabase
        .from('reliability_log')
        .select('*')
        .eq('worker_id', worker.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) setReliabilityLog(data || []);
    } catch (e) {
      console.error('Error loading reliability log:', e);
    } finally {
      setLoadingLog(false);
    }
  };

  if (!worker) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Error: Worker profile not found.</p>
      </div>
    );
  }

  // Calculate total gigs dynamically from past completed assignments
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalGigs = assignments.filter(a => {
    if (a.worker_id !== worker.id) return false;
    if (a.status !== 'approved' && a.status !== 'assigned') return false;
    const event = events.find(e => e.id === a.event_id);
    if (!event) return false;
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  }).length;

  const loadJsPDF = () => new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // IRS standard mileage rates by year (update annually)
  const IRS_MILEAGE_RATES = {
    2025: 0.70,
    2024: 0.67,
    2023: 0.655,
    2022: 0.585, // first half; 0.625 second half — use blended avg
    2021: 0.56,
  };
  const getIrsRate = (year) => IRS_MILEAGE_RATES[year] || 0.67; // fallback to recent rate

  const generateMileageReport = async () => {
    if (!worker.address) {
      alert('This worker has no home address saved. Please add their address first.');
      return;
    }
    setGeneratingReport(true);
    try {
      const jsPDF = await loadJsPDF();

      // Get approved assignments for the selected year
      const yearAssignments = assignments.filter(a => {
        if (a.worker_id !== worker.id) return false;
        if (a.status !== 'approved' && a.status !== 'assigned') return false;
        const ev = events.find(e => e.id === a.event_id);
        if (!ev) return false;
        return new Date(ev.date).getFullYear() === reportYear;
      });

      if (yearAssignments.length === 0) {
        alert(`No approved assignments found for ${worker.name} in ${reportYear}.`);
        setGeneratingReport(false);
        return;
      }

      // Fetch distances for all events with addresses
      const eventsForAssignments = yearAssignments
        .map(a => events.find(e => e.id === a.event_id))
        .filter(Boolean);

      const distanceMap = {};
      await Promise.all(
        eventsForAssignments
          .filter(ev => ev.address)
          .map(ev =>
            fetch(`/api/get-distance?origin=${encodeURIComponent(worker.address)}&destination=${encodeURIComponent(ev.address)}`)
              .then(r => r.json())
              .then(d => { if (d.miles != null) distanceMap[ev.id] = d.miles; })
              .catch(() => {})
          )
      );

      // Build PDF
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = 20;

      // Header
      doc.setFillColor(127, 0, 0);
      doc.rect(0, 0, pageW, 36, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Vegas on Wheels', margin, 14);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Mileage Report — ${reportYear}`, margin, 24);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, 31);
      y = 48;

      // Worker info block
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Worker Information', margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(`Name: ${worker.name}`, margin, y); y += 6;
      doc.text(`Home Address: ${worker.address}`, margin, y); y += 6;
      if (worker.email) { doc.text(`Email: ${worker.email}`, margin, y); y += 6; }
      y += 4;

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      // Table header
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y - 4, pageW - margin * 2, 10, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      const col = { date: margin, event: margin + 25, address: margin + 80, miles: pageW - margin - 16 };
      doc.text('Date', col.date, y + 2);
      doc.text('Event', col.event, y + 2);
      doc.text('Address', col.address, y + 2);
      doc.text('Miles', col.miles, y + 2);
      y += 12;

      let totalMiles = 0;
      let rowCount = 0;

      // Sort by date
      const sortedAssignments = [...yearAssignments].sort((a, b) => {
        const ea = events.find(e => e.id === a.event_id);
        const eb = events.find(e => e.id === b.event_id);
        return new Date(ea?.date || 0) - new Date(eb?.date || 0);
      });

      for (const assignment of sortedAssignments) {
        const ev = events.find(e => e.id === assignment.event_id);
        if (!ev) continue;

        // New page if needed
        if (y > 260) {
          doc.addPage();
          y = 20;
        }

        const miles = distanceMap[ev.id];
        if (miles != null) totalMiles += miles;

        const dateStr = new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const eventName = (ev.name || '').substring(0, 28);
        const addr = (ev.address || 'N/A').substring(0, 35);
        const milesStr = miles != null ? `${miles} mi` : 'N/A';

        if (rowCount % 2 === 0) {
          doc.setFillColor(252, 252, 252);
          doc.rect(margin, y - 4, pageW - margin * 2, 8, 'F');
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        doc.text(dateStr, col.date, y);
        doc.text(eventName, col.event, y);
        doc.setTextColor(100, 100, 100);
        doc.text(addr, col.address, y);
        doc.setTextColor(40, 40, 40);
        doc.text(milesStr, col.miles, y);
        y += 9;
        rowCount++;
      }

      // Total + IRS calculation box
      const irsRate = getIrsRate(reportYear);
      const irsDeduction = (totalMiles * irsRate).toFixed(2);

      y += 4;
      doc.setDrawColor(127, 0, 0);
      doc.line(margin, y, pageW - margin, y);
      y += 8;

      // Summary box
      doc.setFillColor(250, 245, 245);
      doc.setDrawColor(200, 180, 180);
      doc.roundedRect(margin, y - 4, pageW - margin * 2, 32, 3, 3, 'FD');
      y += 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(`Total Events: ${rowCount}`, margin + 6, y);
      doc.text(`Total Miles: ${totalMiles} mi`, margin + 70, y);
      y += 8;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      doc.text(`IRS Standard Mileage Rate (${reportYear}):`, margin + 6, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(127, 0, 0);
      doc.text(`$${irsRate.toFixed(3)}/mile`, margin + 90, y);
      y += 8;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text('Estimated Mileage Deduction:', margin + 6, y);
      doc.setTextColor(127, 0, 0);
      doc.text(`$${Number(irsDeduction).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, margin + 110, y);
      y += 12;

      // Footer note
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text('Distances calculated from worker home address to event address.', margin, y);
      y += 5;
      doc.text(`IRS rate sourced from IRS.gov. Consult a tax professional. For independent contractors (1099) filing Schedule C.`, margin, y);

      doc.save(`mileage-report-${worker.name.replace(/\s+/g, '-').toLowerCase()}-${reportYear}.pdf`);
    } catch (err) {
      alert('Error generating report: ' + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${worker.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-photos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('worker-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('worker-photos')
        .getPublicUrl(filePath);

      // Update worker record with photo URL
      const { error: updateError } = await supabase
        .from('workers')
        .update({ photo_url: publicUrl })
        .eq('id', worker.id);

      if (updateError) throw updateError;

      // Reload worker data
      if (onProfileUpdate) {
        await onProfileUpdate();
      }

      alert('✅ Profile photo updated!');
    } catch (error) {
      alert('Error uploading photo: ' + error.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({
          email: editData.email,
          phone: editData.phone,
          address: editData.address,
          shirt_size: editData.shirt_size
        })
        .eq('id', worker.id);

      if (error) throw error;

      // Call parent callback to reload worker data
      if (onProfileUpdate) {
        await onProfileUpdate();
      }

      setIsEditing(false);
      alert('✅ Profile updated successfully!');
    } catch (error) {
      alert('Error updating profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      email: worker.email || '',
      phone: worker.phone || '',
      address: worker.address || '',
      shirt_size: worker.shirt_size || ''
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-red-900 to-red-800 rounded-lg shadow p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Profile Photo */}
            <div className="relative">
              <div className="bg-white bg-opacity-20 rounded-full p-1 w-24 h-24 flex items-center justify-center overflow-hidden">
                {worker.photo_url ? (
                  <img 
                    src={worker.photo_url} 
                    alt={worker.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <User size={48} />
                )}
              </div>
              
              {/* Upload Photo Button */}
              <label 
                htmlFor="photo-upload"
                className="absolute bottom-0 right-0 bg-white text-red-900 rounded-full p-2 cursor-pointer hover:bg-gray-100 transition-colors shadow-lg"
                title="Change profile photo"
              >
                {uploadingPhoto ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-900"></div>
                ) : (
                  <Camera size={20} />
                )}
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold">{worker.name}</h2>
              <p className="text-red-100">Worker Portal Profile</p>
            </div>
          </div>
          
          {/* Edit/Save Buttons */}
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <Edit2 size={18} />
              <span>Edit Profile</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                <span>{saving ? 'Saving...' : 'Save'}</span>
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
              >
                <X size={18} />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h3>
        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Mail size={16} className="text-gray-400" />
              <span>Email</span>
            </label>
            {isEditing ? (
              <input
                type="email"
                value={editData.email}
                onChange={(e) => setEditData({...editData, email: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="your.email@example.com"
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Phone size={16} className="text-gray-400" />
              <span>Phone</span>
            </label>
            {isEditing ? (
              <input
                type="tel"
                value={editData.phone}
                onChange={(e) => setEditData({...editData, phone: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="(555) 123-4567"
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.phone}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <MapPin size={16} className="text-gray-400" />
              <span>Address</span>
            </label>
            {isEditing ? (
              <textarea
                value={editData.address}
                onChange={(e) => setEditData({...editData, address: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="123 Main St, City, State, ZIP"
                rows={2}
              />
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.address || 'Not provided'}</p>
            )}
          </div>

          {/* Shirt Size */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Shirt size={16} className="text-gray-400" />
              <span>Shirt Size</span>
            </label>
            {isEditing ? (
              <select
                value={editData.shirt_size}
                onChange={(e) => setEditData({...editData, shirt_size: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="">Select Size</option>
                <option value="S">Small</option>
                <option value="M">Medium</option>
                <option value="L">Large</option>
                <option value="XL">XL</option>
                <option value="2XL">2XL</option>
                <option value="3XL">3XL</option>
                <option value="4XL">4XL</option>
                <option value="5XL">5XL</option>
              </select>
            ) : (
              <p className="text-base text-gray-900 pl-6">{worker.shirt_size || 'Not provided'}</p>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Your Skills</h3>
        <div className="flex flex-wrap gap-2">
          {Array.isArray(worker.skills) && worker.skills.length > 0 ? (
            worker.skills.map((skill, idx) => (
              <span 
                key={idx} 
                className="bg-red-50 text-red-800 text-sm px-4 py-2 rounded-full font-medium border border-red-200"
              >
                {getPositionLabel(skill)}
              </span>
            ))
          ) : (
            <p className="text-gray-500">No skills added yet</p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Profile Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <Award size={24} className="mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600 mb-1">Rank Level</p>
            <p className="text-2xl font-bold text-gray-900">Level {worker.rank || 1}</p>
          </div>
          
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <Briefcase size={24} className="mx-auto mb-2 text-yellow-600" />
            <p className="text-sm text-gray-600 mb-1">Total Gigs</p>
            <p className="text-2xl font-bold text-gray-900">{totalGigs}</p>
          </div>
          
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <Calendar size={24} className="mx-auto mb-2 text-red-600" />
            <p className="text-sm text-gray-600 mb-1">No Shows</p>
            <p className="text-2xl font-bold text-gray-900">{worker.no_shows || 0}</p>
          </div>
          
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <Star size={24} className="mx-auto mb-2 text-yellow-500 fill-yellow-500" />
            <p className="text-sm text-gray-600 mb-1">Reliability</p>
            <div className="flex items-center justify-center space-x-1">
              <p className="text-2xl font-bold text-gray-900">{worker.reliability || 0}</p>
              <Star size={16} className="text-yellow-500 fill-yellow-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500 mb-1">Last Worked</p>
            <p className="text-lg font-medium text-gray-900">
              {worker.last_worked 
                ? new Date(worker.last_worked).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })
                : 'N/A'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500 mb-1">Member Since</p>
            <p className="text-lg font-medium text-gray-900">
              {worker.created_at 
                ? new Date(worker.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                  })
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
      {/* Annual Mileage Report */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Annual Mileage Report</h3>
            <p className="text-sm text-gray-500 mt-0.5">Per-event mileage from home address for tax purposes</p>
          </div>
          <FileDown size={22} className="text-gray-400" />
        </div>

        {!worker.address ? (
          <div className="flex items-start space-x-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Navigation size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Home address required</p>
              <p className="text-xs text-amber-600 mt-0.5">Add a home address to this worker's profile to generate mileage reports.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
              >
                {[0,1,2].map(offset => {
                  const yr = new Date().getFullYear() - offset;
                  return <option key={yr} value={yr}>{yr}</option>;
                })}
              </select>
            </div>
            <div className="pt-5">
              <button
                onClick={generateMileageReport}
                disabled={generatingReport}
                className="flex items-center space-x-2 bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 disabled:bg-gray-400 text-sm font-medium"
              >
                <FileDown size={16} />
                <span>{generatingReport ? 'Generating...' : `Download ${reportYear} PDF`}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reliability History */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Reliability History</h3>
          <div className="flex items-center space-x-2">
            <Star size={18} className="text-yellow-500 fill-yellow-500" />
            <span className="text-2xl font-bold text-gray-900">{worker.reliability ?? 5.0}</span>
            <span className="text-sm text-gray-500">/ 5.0</span>
          </div>
        </div>

        {/* Rating bar */}
        <div className="mb-6">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                (worker.reliability ?? 5.0) >= 4.5 ? 'bg-green-500' :
                (worker.reliability ?? 5.0) >= 3.5 ? 'bg-yellow-500' :
                (worker.reliability ?? 5.0) >= 2.0 ? 'bg-orange-500' : 'bg-red-500'
              }`}
              style={{ width: `${((worker.reliability ?? 5.0) / 5.0) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0.0</span>
            <span className={`font-medium ${
              (worker.reliability ?? 5.0) >= 4.5 ? 'text-green-600' :
              (worker.reliability ?? 5.0) >= 3.5 ? 'text-yellow-600' :
              (worker.reliability ?? 5.0) >= 2.0 ? 'text-orange-600' : 'text-red-600'
            }`}>
              {(worker.reliability ?? 5.0) >= 4.5 ? 'Excellent' :
               (worker.reliability ?? 5.0) >= 3.5 ? 'Good' :
               (worker.reliability ?? 5.0) >= 2.0 ? 'Fair' : 'Needs Improvement'}
            </span>
            <span>5.0</span>
          </div>
        </div>

        {loadingLog ? (
          <p className="text-gray-400 text-sm text-center py-4">Loading history...</p>
        ) : reliabilityLog.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <Star size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No rating changes yet.</p>
            <p className="text-xs mt-1">Your rating will update after events are reported.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reliabilityLog.map((entry, idx) => {
              const isPositive = entry.change_amount > 0;
              const isNeutral = entry.change_amount === 0;
              const Icon = isPositive ? TrendingUp : isNeutral ? Minus : TrendingDown;
              const eventForEntry = events.find(e => e.id === entry.event_id);

              return (
                <div key={entry.id || idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                  isPositive ? 'bg-green-50 border-green-200' :
                  isNeutral ? 'bg-gray-50 border-gray-200' :
                  entry.change_amount <= -1.0 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
                }`}>
                  <div className="flex items-center space-x-3">
                    <Icon size={18} className={
                      isPositive ? 'text-green-600' :
                      isNeutral ? 'text-gray-400' :
                      entry.change_amount <= -1.0 ? 'text-red-600' : 'text-orange-500'
                    } />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{entry.reason}</p>
                      <p className="text-xs text-gray-500">
                        {eventForEntry?.name && `${eventForEntry.name} • `}
                        {new Date(entry.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      isPositive ? 'text-green-600' : isNeutral ? 'text-gray-400' : 'text-red-600'
                    }`}>
                      {isPositive ? '+' : ''}{entry.change_amount}
                    </p>
                    <p className="text-xs text-gray-400">
                      {entry.previous_rating?.toFixed(2)} → {entry.new_rating?.toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {/* Reminder Preferences */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Reminder Preferences</h3>
            <p className="text-sm text-gray-500 mt-0.5">Choose which shift reminders you want to receive by email</p>
          </div>
          {savingPrefs && <span className="text-xs text-gray-400">Saving…</span>}
        </div>

        {!reminderPrefsLoaded ? (
          <p className="text-sm text-gray-400">Loading preferences…</p>
        ) : (
          <div className="space-y-3">
            {[
              { key: 'email_96h', label: '96-hour reminder', desc: '4 days before your shift' },
              { key: 'email_48h', label: '48-hour reminder', desc: '2 days before your shift' },
              { key: 'email_24h', label: '24-hour reminder', desc: 'The day before your shift' },
              { key: 'email_4h',  label: '4-hour reminder',  desc: 'Day-of, 4 hours before' },
            ].map(({ key, label, desc }) => (
              <div key={key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:'8px',border:'0.5px solid #e5e7eb',background:'#f9fafb'}}>
                <div>
                  <div style={{fontSize:'14px',fontWeight:'500',color:'#111827'}}>{label}</div>
                  <div style={{fontSize:'12px',color:'#6b7280',marginTop:'1px'}}>{desc}</div>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => toggleReminder(key)}
                  disabled={savingPrefs}
                  style={{
                    width:'44px',height:'24px',borderRadius:'12px',border:'none',cursor:'pointer',
                    position:'relative',transition:'background 0.2s',flexShrink:0,
                    background: reminderPrefs[key] ? '#7c0a02' : '#d1d5db',
                  }}
                  aria-label={`Toggle ${label}`}
                >
                  <div style={{
                    position:'absolute',top:'2px',
                    left: reminderPrefs[key] ? '22px' : '2px',
                    width:'20px',height:'20px',borderRadius:'50%',background:'white',
                    transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                  }}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{fontSize:'11px',color:'#9ca3af',marginTop:'12px'}}>
          SMS reminders coming soon. All reminders are ON by default.
        </p>
      </div>

      </div>
    </div>
  );
}
