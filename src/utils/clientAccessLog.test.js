import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldLogView, logClientAccess, VIEW_LOG_INTERVAL_MS, _resetViewLog, describeAccessEntry } from './clientAccessLog';

describe('shouldLogView', () => {
  it('logs once per interval per key', () => {
    const seen = new Map();
    expect(shouldLogView('a', 0, seen)).toBe(true);
    expect(shouldLogView('a', 1000, seen)).toBe(false);
    expect(shouldLogView('b', 1000, seen)).toBe(true);
    expect(shouldLogView('a', VIEW_LOG_INTERVAL_MS, seen)).toBe(true);
  });
});

describe('logClientAccess', () => {
  beforeEach(() => _resetViewLog());

  it('sends views through the rpc, then throttles', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const sb = { rpc };
    await logClientAccess(sb, { action: 'view', recordType: 'clients', recordIds: [1, 2, null], where: 'settings' });
    await logClientAccess(sb, { action: 'view', recordType: 'clients', recordIds: [1, 2], where: 'settings' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('log_client_access', {
      p_action: 'view',
      p_record_type: 'clients',
      p_record_ids: ['1', '2'],
      p_details: { where: 'settings' }
    });
  });

  it('always logs exports', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await logClientAccess({ rpc }, { action: 'export', recordType: 'clients', recordIds: ['x'] });
    await logClientAccess({ rpc }, { action: 'export', recordType: 'clients', recordIds: ['x'] });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(logClientAccess({ rpc: async () => { throw new Error('down'); } },
      { action: 'export', recordType: 'clients' })).resolves.toBeUndefined();
    await expect(logClientAccess({ rpc: async () => ({ error: { message: 'missing' } }) },
      { action: 'export', recordType: 'clients' })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('describeAccessEntry', () => {
  it('describes a change', () => {
    expect(describeAccessEntry({
      actor_name: 'Dylan', actor_role: 'admin', action: 'update', record_type: 'clients',
      record_id: '5', label: 'Acme Corp', changed_fields: ['email', 'phone']
    })).toBe('Dylan (admin) changed saved client Acme Corp: email, phone');
  });
  it('describes a list view', () => {
    expect(describeAccessEntry({
      actor_name: 'Sam', actor_role: 'sales_manager', action: 'view', record_type: 'clients',
      record_id: null, record_count: 12
    })).toBe('Sam (sales manager) viewed 12 saved clients');
    expect(describeAccessEntry({
      actor_name: 'Sam', action: 'view', record_type: 'event_client_details', record_count: 40
    })).toBe('Sam viewed 40 event client details');
  });
  it('names server jobs', () => {
    expect(describeAccessEntry({ action: 'delete', record_type: 'clients', record_id: '1', label: 'X' }))
      .toBe('System deleted saved client X');
  });
});
