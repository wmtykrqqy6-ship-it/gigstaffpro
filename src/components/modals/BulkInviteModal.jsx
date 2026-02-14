import React, { useState } from 'react';
import { X, Mail } from 'lucide-react';
import { positionMatches } from '../../utils/positionHelpers';
import { SUCCESS_MESSAGES } from '../../constants';

export default function BulkInviteModal({
  open,
  workers,
  positions,
  onClose,
  onSuccess
}) {
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedRanks, setSelectedRanks] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  // Filter workers based on criteria
  const filteredWorkers = workers.filter(worker => {
    if (selectedPosition) {
      const hasPosition = worker.skills?.some(skill => 
        positionMatches(skill, selectedPosition)
      );
      if (!hasPosition) return false;
    }
    
    if (selectedRanks.length > 0) {
      if (!selectedRanks.includes(worker.rank)) return false;
    }
    
    return true;
  });

  const handleSendInvites = async () => {
    if (filteredWorkers.length === 0) {
      alert('No workers match the selected criteria.');
      return;
    }

    if (!confirm(`Send invite to ${filteredWorkers.length} worker(s)?`)) return;

    setSending(true);
    try {
      // In a real implementation, this would send SMS/Email via Twilio/SendGrid
      // For now, we'll just log it
      
      alert(
        `✓ Invites sent to ${filteredWorkers.length} worker(s)!\n\n` +
        `(Note: SMS/Email integration not yet connected)`
      );
      
      // Reset form
      setSelectedPosition('');
      setSelectedRanks([]);
      setMessage('');
      
      // Call success callback if provided
      if (onSuccess) {
        await onSuccess();
      }
      
      // Close modal
      onClose();
    } catch (error) {
      alert('Error sending invites: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const toggleRank = (rank) => {
    setSelectedRanks(prev => 
      prev.includes(rank)
        ? prev.filter(r => r !== rank)
        : [...prev, rank]
    );
  };

  const handleClose = () => {
    setSelectedPosition('');
    setSelectedRanks([]);
    setMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">Bulk Send Invites</h3>
              <button 
                onClick={handleClose} 
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Position Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Position (optional)
                </label>
                <select
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="">All Positions</option>
                  {positions.map(pos => (
                    <option key={pos.key} value={pos.key}>
                      {pos.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rank Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Rank (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map(rank => (
                    <button
                      key={rank}
                      type="button"
                      onClick={() => toggleRank(rank)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        selectedRanks.includes(rank)
                          ? 'bg-red-900 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Rank {rank}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900">
                  {filteredWorkers.length} worker(s) match criteria
                </p>
                {filteredWorkers.length > 0 && (
                  <div className="mt-2 text-xs text-blue-700">
                    {filteredWorkers.slice(0, 5).map(w => w.name).join(', ')}
                    {filteredWorkers.length > 5 && ` +${filteredWorkers.length - 5} more`}
                  </div>
                )}
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a custom message to the invite..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              {/* Warning about SMS/Email not connected */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-900">
                  ⚠️ <strong>Note:</strong> SMS/Email integration is not yet connected. 
                  This will log the invites but won't actually send messages.
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-3">
                <button
                  onClick={handleSendInvites}
                  disabled={sending || filteredWorkers.length === 0}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2"
                >
                  <Mail size={20} />
                  <span>
                    {sending 
                      ? 'Sending...' 
                      : `Send to ${filteredWorkers.length} Worker(s)`
                    }
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={sending}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
