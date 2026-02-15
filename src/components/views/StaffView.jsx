import React from 'react';
import { Users, Plus, Mail, Edit, Trash2, Star } from 'lucide-react';

export default function StaffView({
  loading,
  error,
  workers,
  onShowBulkInvite,
  onShowAddWorker,
  onSetPin,
  onEditWorker,
  onDeleteWorker,
  onRetryLoad
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading workers from Supabase...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Database Connection Error</h3>
        <p className="text-red-700 text-sm">{error}</p>
        <button 
          onClick={onRetryLoad}
          className="mt-4 bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-sm text-green-600 mt-1">Connected to Supabase • {workers.length} workers</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={onShowBulkInvite}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors"
          >
            <Mail size={20} />
            <span>Bulk Invite</span>
          </button>
          <button 
            onClick={onShowAddWorker}
            className="bg-red-900 text-white px-6 py-3 rounded-lg hover:bg-red-800 flex items-center space-x-2 transition-colors"
          >
            <Plus size={20} />
            <span>Add Worker</span>
          </button>
        </div>
      </div>

      {workers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Workers Yet</h3>
          <p className="text-gray-600 mb-4">Add your first worker to get started!</p>
          <button 
            onClick={onShowAddWorker}
            className="bg-red-900 text-white px-6 py-2 rounded-lg hover:bg-red-800"
          >
            Add Worker
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Skills</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Rating</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Total Gigs</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workers.map(worker => (
                  <tr key={worker.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-semibold text-gray-900">{worker.name}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(worker.skills) && worker.skills.map((skill, idx) => (
                          <span key={idx} className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded font-medium">
                        Level {worker.rank}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-1">
                        <Star size={16} className="text-yellow-500 fill-yellow-500" />
                        <span className="font-semibold">{worker.reliability}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-semibold text-gray-900">{worker.total_gigs}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-600">
                        <p>{worker.phone}</p>
                        <p className="text-xs">{worker.email}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => onSetPin(worker)}
                          className={`${worker.pin_hash ? 'text-green-600 hover:text-green-800 hover:bg-green-50' : 'text-orange-600 hover:text-orange-800 hover:bg-orange-50'} p-1 rounded transition-colors`}
                          title={worker.pin_hash ? 'Change PIN' : 'Set PIN (Required for Login)'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                        </button>
                        <button 
                          onClick={() => onEditWorker(worker)}
                          className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded transition-colors"
                          title="Edit worker"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                          onClick={() => onDeleteWorker(worker.id)}
                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded transition-colors"
                          title="Delete worker"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
