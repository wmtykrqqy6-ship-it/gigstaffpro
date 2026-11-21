import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { describeAccessEntry } from '../../utils/clientAccessLog';

// Settings -> Access log: the latest entries in public.client_access_log
// (who viewed, exported, added, changed or deleted client records).
// Read-only: nobody can edit or delete entries.
const PAGE_SIZE = 200;

export default function ClientAccessLogCard() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [problem, setProblem] = useState('');

  const load = async () => {
    setLoading(true);
    setProblem('');
    const { data, error } = await supabase
      .from('client_access_log')
      .select('id, at, auth_user_id, actor_name, actor_role, action, record_type, record_id, record_count, label, changed_fields')
      .order('at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      setEntries([]);
      setProblem('The access log isn\'t available yet. It starts once the database update for it has been run.');
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2">
          <Lock size={20} className="text-red-900" />
          <h3 className="text-lg font-semibold text-gray-900">Client access log</h3>
        </div>
        <button onClick={load} className="text-sm text-gray-600 hover:text-gray-900 underline">Refresh</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Who viewed, exported, added, changed or deleted client records. Changes are recorded by the database;
        list views are recorded at most once every 10 minutes per screen. Entries can't be edited or deleted.
        Showing the latest {PAGE_SIZE}.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : problem ? (
        <p className="text-gray-600 text-sm">{problem}</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-600 text-sm">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {entries.map(e => (
            <li key={e.id} className="py-2 text-sm flex flex-col sm:flex-row sm:space-x-4">
              <span className="text-gray-500 whitespace-nowrap sm:w-44">
                {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="text-gray-900">{describeAccessEntry(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
