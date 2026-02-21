import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function PaymentCalculatorModal({
  open,
  assignmentData,
  selectedEvent,
  workers,
  eventPaymentSettings,
  paymentTrackingEnabled,
  payRates,
  calculatePay,
  getPayRateKey,
  onClose,
  onSuccess
}) {
  const [hours, setHours] = useState(0);
  const [miles, setMiles] = useState(0);
  const [isLakeGeneva, setIsLakeGeneva] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [calculation, setCalculation] = useState(null);

  // Don't show payment modal if payment tracking is disabled
  if (!paymentTrackingEnabled) {
    if (open && assignmentData) {
      // Just assign without payment calculation
      const assignWithoutPayment = async () => {
        try {
          const { error } = await supabase
            .from('assignments')
            .insert([{
              event_id: selectedEvent.id,
              worker_id: assignmentData.workerId,
              position: assignmentData.position,
              status: 'approved'
            }]);
          
          if (error) throw error;
          
          const worker = workers.find(w => w.id === assignmentData.workerId);
          if (onSuccess) await onSuccess();
          onClose();
          alert(`${worker.name} assigned to ${assignmentData.position}`);
        } catch (error) {
          alert('Error creating assignment: ' + error.message);
        }
      };
      assignWithoutPayment();
    }
    return null;
  }

  useEffect(() => {
    if (assignmentData) {
      // Check if event has payment settings configured
      if (eventPaymentSettings[selectedEvent.id]) {
        const settings = eventPaymentSettings[selectedEvent.id];
        setHours(settings.hours);
        setMiles(settings.miles);
        setIsLakeGeneva(settings.isLakeGeneva);
        setIsHoliday(settings.isHoliday);
      } else {
        setHours(assignmentData.defaultHours || 0);
        setMiles(0);
        setIsLakeGeneva(false);
        setIsHoliday(false);
      }
    }
  }, [assignmentData, eventPaymentSettings, selectedEvent]);

  useEffect(() => {
    if (assignmentData && hours > 0) {
      const calc = calculatePay(
        assignmentData.position,
        hours,
        miles,
        isLakeGeneva,
        isHoliday
      );
      setCalculation(calc);
    }
  }, [hours, miles, isLakeGeneva, isHoliday, assignmentData, calculatePay]);

  const handleConfirm = async () => {
    if (!assignmentData || !calculation) return;
    
    if (hours <= 0) {
      alert('Hours must be greater than 0');
      return;
    }

    try {
      const { error } = await supabase
        .from('assignments')
        .insert([{
          event_id: selectedEvent.id,
          worker_id: assignmentData.workerId,
          position: assignmentData.position,
          status: 'approved',
          hours: hours,
          miles: miles,
          is_lake_geneva: isLakeGeneva,
          is_holiday: isHoliday,
          base_pay: calculation.basePay,
          travel_pay: calculation.travelPay,
          lake_geneva_bonus: calculation.lakeGenevaBonus,
          subtotal: calculation.subtotal,
          holiday_multiplier: calculation.holidayMultiplier,
          total_pay: calculation.totalPay,
          payment_status: 'pending'
        }]);
      
      if (error) throw error;
      
      // ✅ AUTO-CONVERT: Check if position is now full, convert pending to standby
      if (selectedEvent && selectedEvent.positions) {
        const positionDef = selectedEvent.positions.find(p => {
          const pKey = p.key || p.name;
          return pKey === assignmentData.position ||
                 p.name === assignmentData.position ||
                 p.key === assignmentData.position;
        });
        
        if (positionDef) {
          const maxCount = positionDef.count || 1;
          
          // Get fresh assignments data (reload needed because we just inserted)
          const { data: freshAssignments } = await supabase
            .from('assignments')
            .select('*')
            .eq('event_id', selectedEvent.id);
          
          // Count currently approved workers (excluding standby)
          const currentApproved = (freshAssignments || []).filter(a => {
            if (a.status === 'standby') return false;
            const s = a.status;
            if (s === 'pending' || s === 'rejected' || s === 'cancelled') return false;
            if (s !== 'approved' && s !== null && s !== undefined) return false;
            return a.position === assignmentData.position ||
                   a.position === positionDef.key ||
                   a.position === positionDef.name;
          }).length;
          
          // If position is now full, convert all pending applications to standby
          if (currentApproved >= maxCount) {
            const pendingApps = (freshAssignments || []).filter(a => {
              if (a.status !== 'pending') return false;
              return a.position === assignmentData.position ||
                     a.position === positionDef.key ||
                     a.position === positionDef.name;
            });
            
            if (pendingApps.length > 0) {
              // Convert all pending to standby
              const { error: standbyError } = await supabase
                .from('assignments')
                .update({ status: 'standby' })
                .in('id', pendingApps.map(a => a.id));
              
              if (!standbyError) {
                console.log(`✅ Auto-converted ${pendingApps.length} pending applications to standby`);
              }
            }
          }
        }
      }
      
      const worker = workers.find(w => w.id === assignmentData.workerId);
      
      if (onSuccess) await onSuccess();
      onClose();
      
      alert(`✓ ${worker.name} assigned to ${assignmentData.position}\n\nTotal Pay: $${calculation.totalPay.toFixed(2)}`);
    } catch (error) {
      alert('Error creating assignment: ' + error.message);
    }
  };

  const handleClose = () => {
    setHours(0);
    setMiles(0);
    setIsLakeGeneva(false);
    setIsHoliday(false);
    setCalculation(null);
    onClose();
  };

  if (!open || !assignmentData) return null;

  const worker = workers.find(w => w.id === assignmentData.workerId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Calculate Payment</h3>
              <p className="text-sm text-gray-600 mt-1">
                {worker?.name} • {assignmentData.position}
              </p>
            </div>
            <button 
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Notice if using event settings */}
            {eventPaymentSettings[selectedEvent.id] && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p className="text-sm text-green-800">
                  ✓ Using event payment settings. You can adjust these values if needed for this specific assignment.
                </p>
              </div>
            )}

            {/* Input Section */}
            <div className="bg-gray-50 p-4 rounded-lg space-y-4">
              <h4 className="font-semibold text-gray-900">Event Details</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hours Worked *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Miles from Warehouse *
                </label>
                <input
                  type="number"
                  min="0"
                  value={miles}
                  onChange={(e) => setMiles(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="lakeGeneva"
                  checked={isLakeGeneva}
                  onChange={(e) => setIsLakeGeneva(e.target.checked)}
                  className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                />
                <label htmlFor="lakeGeneva" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Lake Geneva Event (+$15)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="holiday"
                  checked={isHoliday}
                  onChange={(e) => setIsHoliday(e.target.checked)}
                  className="rounded border-gray-300 text-red-900 focus:ring-red-500"
                />
                <label htmlFor="holiday" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Holiday Pay (1.5× multiplier)
                </label>
              </div>
            </div>

            {/* Calculation Breakdown */}
            {calculation && hours > 0 && (
              <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-3">Payment Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Base Pay ({hours} hrs × ${payRates[getPayRateKey(assignmentData.position)] || 0}/hr):</span>
                    <span className="font-semibold text-gray-900">${calculation.basePay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Travel Pay ({miles} miles):</span>
                    <span className="font-semibold text-gray-900">${calculation.travelPay.toFixed(2)}</span>
                  </div>
                  {isLakeGeneva && (
                    <div className="flex justify-between">
                      <span className="text-gray-700">Lake Geneva Bonus:</span>
                      <span className="font-semibold text-gray-900">${calculation.lakeGenevaBonus.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-blue-300">
                    <span className="text-gray-700">Subtotal:</span>
                    <span className="font-semibold text-gray-900">${calculation.subtotal.toFixed(2)}</span>
                  </div>
                  {isHoliday && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Holiday Multiplier:</span>
                        <span className="font-semibold text-gray-900">{calculation.holidayMultiplier}×</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t-2 border-blue-400">
                        <span className="text-gray-900 font-bold">Total Pay:</span>
                        <span className="font-bold text-blue-600 text-lg">${calculation.totalPay.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  {!isHoliday && (
                    <div className="flex justify-between pt-2 border-t-2 border-blue-400">
                      <span className="text-gray-900 font-bold">Total Pay:</span>
                      <span className="font-bold text-blue-600 text-lg">${calculation.totalPay.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleConfirm}
                disabled={hours <= 0}
                className="flex-1 bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Confirm Assignment
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
