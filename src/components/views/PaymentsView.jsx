import React, { useState } from 'react';
import { DollarSign, CheckCircle, Clock, Filter, Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { getPositionLabel } from '../../utils/positionHelpers';

export default function PaymentsView({
  assignments,
  workers,
  events,
  timeFormat,
  paymentTrackingEnabled,
  onReloadAssignments
}) {
    const [filterStatus, setFilterStatus] = useState('all'); // all, pending, paid
    const [filterWorker, setFilterWorker] = useState('all');
    const [filterEvent, setFilterEvent] = useState('all');
    const [filterDateRange, setFilterDateRange] = useState('all'); // all, this_week, last_week, this_month, last_month, custom
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [groupBy, setGroupBy] = useState('none'); // none, event, worker
    const [selectedAssignments, setSelectedAssignments] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    // Get all assignments with payment data
    const assignmentsWithDetails = assignments
      .map(assignment => {
        const worker = workers.find(w => w.id === assignment.worker_id);
        const event = events.find(e => e.id === assignment.event_id);
        return { ...assignment, worker, event };
      })
      .filter(a => a.worker && a.event); // Only show assignments with valid worker and event

    // Apply filters
    const filteredAssignments = assignmentsWithDetails.filter(assignment => {
      // Status filter
      if (filterStatus !== 'all' && assignment.payment_status !== filterStatus) return false;
      
      // Worker filter
      if (filterWorker !== 'all' && assignment.worker_id !== filterWorker) return false;
      
      // Event filter
      if (filterEvent !== 'all' && assignment.event_id !== filterEvent) return false;
      
      // Date range filter
      if (filterDateRange !== 'all' && assignment.event) {
        const eventDate = parseDateSafe(assignment.event.date);
        const now = new Date();
        
        if (filterDateRange === 'this_week') {
          const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          if (eventDate < weekStart || eventDate > weekEnd) return false;
        } else if (filterDateRange === 'last_week') {
          const lastWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
          if (eventDate < lastWeekStart || eventDate > lastWeekEnd) return false;
        } else if (filterDateRange === 'this_month') {
          if (eventDate.getMonth() !== now.getMonth() || eventDate.getFullYear() !== now.getFullYear()) return false;
        } else if (filterDateRange === 'last_month') {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (eventDate.getMonth() !== lastMonth.getMonth() || eventDate.getFullYear() !== lastMonth.getFullYear()) return false;
        } else if (filterDateRange === 'custom') {
          if (customStartDate) {
            const start = parseDateSafe(customStartDate);
            if (eventDate < start) return false;
          }
          if (customEndDate) {
            const end = parseDateSafe(customEndDate);
            if (eventDate > end) return false;
          }
        }
      }
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          assignment.worker.name.toLowerCase().includes(searchLower) ||
          assignment.event.name.toLowerCase().includes(searchLower) ||
          assignment.position.toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });

    // Calculate totals
    const totalOwed = filteredAssignments
      .filter(a => a.payment_status === 'pending')
      .reduce((sum, a) => sum + (a.total_pay || 0), 0);

    const totalPaid = filteredAssignments
      .filter(a => a.payment_status === 'paid')
      .reduce((sum, a) => sum + (a.total_pay || 0), 0);

    const markAsPaid = async (assignmentId) => {
      if (!confirm('Mark this payment as paid?')) return;
      
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', assignmentId);
        
        if (error) throw error;
        
        onReloadAssignments();
        alert('Payment marked as paid!');
      } catch (error) {
        alert('Error updating payment status: ' + error.message);
      }
    };

    const markAsPending = async (assignmentId) => {
      if (!confirm('Mark this payment as pending (unpaid)?')) return;
      
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'pending',
            paid_at: null
          })
          .eq('id', assignmentId);
        
        if (error) throw error;
        
        onReloadAssignments();
        alert('Payment marked as pending!');
      } catch (error) {
        alert('Error updating payment status: ' + error.message);
      }
    };

    const toggleSelectAssignment = (assignmentId) => {
      setSelectedAssignments(prev => 
        prev.includes(assignmentId)
          ? prev.filter(id => id !== assignmentId)
          : [...prev, assignmentId]
      );
    };

    const toggleSelectAll = () => {
      if (selectedAssignments.length === filteredAssignments.length) {
        setSelectedAssignments([]);
      } else {
        setSelectedAssignments(filteredAssignments.map(a => a.id));
      }
    };

    const selectAllPending = () => {
      const pendingIds = filteredAssignments
        .filter(a => a.payment_status === 'pending')
        .map(a => a.id);
      setSelectedAssignments(pendingIds);
    };

    const bulkMarkAsPaid = async () => {
      if (selectedAssignments.length === 0) {
        alert('Please select assignments to mark as paid');
        return;
      }

      if (!confirm(`Mark ${selectedAssignments.length} assignments as paid?`)) return;

      setBulkActionLoading(true);
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'paid',
            paid_at: new Date().toISOString()
          })
          .in('id', selectedAssignments);
        
        if (error) throw error;
        
        setSelectedAssignments([]);
        onReloadAssignments();
        alert(`${selectedAssignments.length} payments marked as paid!`);
      } catch (error) {
        alert('Error updating payments: ' + error.message);
      } finally {
        setBulkActionLoading(false);
      }
    };

    const bulkMarkAsPending = async () => {
      if (selectedAssignments.length === 0) {
        alert('Please select assignments to mark as pending');
        return;
      }

      if (!confirm(`Mark ${selectedAssignments.length} assignments as pending?`)) return;

      setBulkActionLoading(true);
      try {
        const { error } = await supabase
          .from('assignments')
          .update({
            payment_status: 'pending',
            paid_at: null
          })
          .in('id', selectedAssignments);
        
        if (error) throw error;
        
        setSelectedAssignments([]);
        onReloadAssignments();
        alert(`${selectedAssignments.length} payments marked as pending!`);
      } catch (error) {
        alert('Error updating payments: ' + error.message);
      } finally {
        setBulkActionLoading(false);
      }
    };

    // Group assignments by event or worker
    const getGroupedAssignments = () => {
      if (groupBy === 'event') {
        const grouped = {};
        filteredAssignments.forEach(assignment => {
          const eventId = assignment.event_id;
          if (!grouped[eventId]) {
            grouped[eventId] = {
              event: assignment.event,
              assignments: [],
              totalPay: 0,
              pendingCount: 0,
              paidCount: 0
            };
          }
          grouped[eventId].assignments.push(assignment);
          grouped[eventId].totalPay += assignment.total_pay || 0;
          if (assignment.payment_status === 'pending') grouped[eventId].pendingCount++;
          if (assignment.payment_status === 'paid') grouped[eventId].paidCount++;
        });
        return Object.values(grouped);
      } else if (groupBy === 'worker') {
        const grouped = {};
        filteredAssignments.forEach(assignment => {
          const workerId = assignment.worker_id;
          if (!grouped[workerId]) {
            grouped[workerId] = {
              worker: assignment.worker,
              assignments: [],
              totalPay: 0,
              pendingCount: 0,
              paidCount: 0
            };
          }
          grouped[workerId].assignments.push(assignment);
          grouped[workerId].totalPay += assignment.total_pay || 0;
          if (assignment.payment_status === 'pending') grouped[workerId].pendingCount++;
          if (assignment.payment_status === 'paid') grouped[workerId].paidCount++;
        });
        return Object.values(grouped);
      }
      return null;
    };

    const groupedData = getGroupedAssignments();

    const exportToCSV = () => {
      setExportingCSV(true);
      
      try {
        // Prepare CSV data
        const csvData = filteredAssignments.map(assignment => ({
          'Worker Name': assignment.worker.name,
          'Worker Email': assignment.worker.email,
          'Worker Phone': assignment.worker.phone,
          'Event Name': assignment.event.name,
          'Event Date': new Date(assignment.event.date).toLocaleDateString('en-US'),
          'Venue': assignment.event.venue,
          'Position': assignment.position,
          'Hours': assignment.hours || 0,
          'Miles': assignment.miles || 0,
          'Base Pay': (assignment.base_pay || 0).toFixed(2),
          'Travel Pay': (assignment.travel_pay || 0).toFixed(2),
          'Lake Geneva Bonus': (assignment.lake_geneva_bonus || 0).toFixed(2),
          'Holiday Multiplier': assignment.holiday_multiplier || 1.0,
          'Total Pay': (assignment.total_pay || 0).toFixed(2),
          'Payment Status': assignment.payment_status || 'pending',
          'Paid Date': assignment.paid_at ? new Date(assignment.paid_at).toLocaleDateString('en-US') : ''
        }));

        // Convert to CSV string
        const headers = Object.keys(csvData[0] || {});
        const csvContent = [
          headers.join(','),
          ...csvData.map(row => 
            headers.map(header => {
              const value = row[header];
              // Escape commas and quotes in values
              if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            }).join(',')
          )
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `payments_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        setTimeout(() => setExportingCSV(false), 500); // Brief delay so user sees feedback
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-gray-900">Payment Tracking</h2>
          <button
            onClick={exportToCSV}
            disabled={filteredAssignments.length === 0 || exportingCSV}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {exportingCSV ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                <span>Export to CSV</span>
              </>
            )}
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Pending Payments</p>
                <p className="text-3xl font-bold text-gray-900">${totalOwed.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filteredAssignments.filter(a => a.payment_status === 'pending').length} assignments
                </p>
              </div>
              <AlertCircle className="text-yellow-500" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Paid Out</p>
                <p className="text-3xl font-bold text-gray-900">${totalPaid.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filteredAssignments.filter(a => a.payment_status === 'paid').length} assignments
                </p>
              </div>
              <CheckCircle className="text-green-600" size={40} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Assignments</p>
                <p className="text-3xl font-bold text-gray-900">{filteredAssignments.length}</p>
                <p className="text-sm text-gray-500 mt-1">
                  ${(totalOwed + totalPaid).toFixed(2)} total
                </p>
              </div>
              <DollarSign className="text-blue-600" size={40} />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
            
            {/* View Mode Toggle */}
            <div className="flex space-x-2">
              <button
                onClick={() => setGroupBy('none')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'none'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Assignment
              </button>
              <button
                onClick={() => setGroupBy('event')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'event'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Event
              </button>
              <button
                onClick={() => setGroupBy('worker')}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  groupBy === 'worker'
                    ? 'bg-red-900 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Worker
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                placeholder="Worker, event, position..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
              <select
                value={filterWorker}
                onChange={(e) => setFilterWorker(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Workers</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
              <select
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Events</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay Period</label>
              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {filterDateRange === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2">
            <button
              onClick={selectAllPending}
              disabled={filteredAssignments.filter(a => a.payment_status === 'pending').length === 0}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium text-sm"
            >
              Select All Pending
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {groupBy === 'none' && selectedAssignments.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="text-blue-600" size={20} />
              <span className="text-sm font-medium text-blue-900">
                {selectedAssignments.length} assignment{selectedAssignments.length !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={bulkMarkAsPaid}
                disabled={bulkActionLoading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {bulkActionLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Mark All as Paid</span>
                )}
              </button>
              <button
                onClick={bulkMarkAsPending}
                disabled={bulkActionLoading}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {bulkActionLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Mark All as Pending</span>
                )}
              </button>
              <button
                onClick={() => setSelectedAssignments([])}
                disabled={bulkActionLoading}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Payments Table or Grouped View */}
        {groupBy === 'none' ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedAssignments.length === filteredAssignments.length && filteredAssignments.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Worker</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Position</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map(assignment => (
                    <tr key={assignment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedAssignments.includes(assignment.id)}
                          onChange={() => toggleSelectAssignment(assignment.id)}
                          className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{assignment.worker.name}</div>
                        <div className="text-sm text-gray-500">{assignment.worker.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{assignment.event.name}</div>
                        <div className="text-sm text-gray-500">{assignment.event.venue}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">{getPositionLabel(assignment.position)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assignment.hours || 0} hrs
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">${(assignment.total_pay || 0).toFixed(2)}</div>
                        {assignment.total_pay > 0 && (
                          <div className="text-xs text-gray-500">
                            Base: ${(assignment.base_pay || 0).toFixed(2)} • Travel: ${(assignment.travel_pay || 0).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {assignment.payment_status === 'paid' ? (
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded flex items-center space-x-1 w-fit">
                            <CheckCircle size={14} />
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded flex items-center space-x-1 w-fit">
                            <Clock size={14} />
                            <span>Pending</span>
                          </span>
                        )}
                        {assignment.paid_at && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(assignment.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {assignment.payment_status === 'pending' ? (
                          <button
                            onClick={() => markAsPaid(assignment.id)}
                            className="text-green-600 hover:text-green-800 font-medium"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(assignment.id)}
                            className="text-gray-600 hover:text-gray-800 font-medium"
                          >
                            Mark Pending
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        ) : (
          /* Grouped View */
          <div className="space-y-4">
            {groupedData && groupedData.map((group, index) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Group Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {groupBy === 'event' ? group.event.name : group.worker.name}
                      </h3>
                      {groupBy === 'event' && (
                        <p className="text-sm text-gray-600">
                          {group.event.venue} • {new Date(group.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {groupBy === 'worker' && (
                        <p className="text-sm text-gray-600">{group.worker.phone} • {group.worker.email}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">${group.totalPay.toFixed(2)}</p>
                      <div className="flex items-center space-x-2 text-sm mt-1">
                        {group.pendingCount > 0 && (
                          <span className="text-yellow-600">{group.pendingCount} pending</span>
                        )}
                        {group.paidCount > 0 && (
                          <span className="text-green-600">{group.paidCount} paid</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-gray-200">
                  {group.assignments.map(assignment => (
                    <div key={assignment.id} className="px-6 py-4 hover:bg-gray-50 flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">{getPositionLabel(assignment.position)}</span>
                          {assignment.payment_status === 'paid' ? (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded flex items-center space-x-1">
                              <CheckCircle size={12} />
                              <span>Paid</span>
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded flex items-center space-x-1">
                              <Clock size={12} />
                              <span>Pending</span>
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 mt-1 font-medium">
                          {groupBy === 'event' ? assignment.worker.name : assignment.event.name}
                        </p>
                        {groupBy === 'worker' && (
                          <p className="text-sm text-gray-600">
                            {new Date(assignment.event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {assignment.event.venue}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {assignment.hours || 0} hrs • Base: ${(assignment.base_pay || 0).toFixed(2)} • Travel: ${(assignment.travel_pay || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right flex items-center space-x-4">
                        <div>
                          <p className="text-lg font-bold text-gray-900">${(assignment.total_pay || 0).toFixed(2)}</p>
                          {assignment.paid_at && (
                            <p className="text-xs text-gray-500">
                              Paid {new Date(assignment.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                        {assignment.payment_status === 'pending' ? (
                          <button
                            onClick={() => markAsPaid(assignment.id)}
                            className="text-green-600 hover:text-green-800 font-medium text-sm"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(assignment.id)}
                            className="text-gray-600 hover:text-gray-800 font-medium text-sm"
                          >
                            Mark Pending
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {groupedData && groupedData.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                No payments found
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
}
