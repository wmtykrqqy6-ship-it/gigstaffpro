import { describe, it, expect, vi } from 'vitest';
import {
  readImportFile, groupProjectsIntoClients, planGoodshuffleImport,
  clientRowFromGroup, fillMissingClientFields, projectRow, chunk, isSignedProject
} from './goodshuffleImport';
import { fetchAllRows } from './clientRecords';

// Made-up sample data.
const P = (id, extra) => ({ project_id: String(id), status: 'Quote Sent', ...extra });

describe('readImportFile', () => {
  it('accepts an import file and drops rows without a project number', () => {
    const text = JSON.stringify({ source: 'goodshuffle', format: 1, projects: [P(1), { name: 'x' }] });
    expect(readImportFile(text)).toHaveLength(1);
  });
  it('rejects anything else', () => {
    expect(() => readImportFile('not json')).toThrow(/import file/);
    expect(() => readImportFile('{"projects":[]}')).toThrow(/import file/);
  });
});

describe('groupProjectsIntoClients', () => {
  it('joins projects by name, email or phone', () => {
    const { groups, skipped } = groupProjectsIntoClients([
      P(1, { client_name: 'Pat Lee', contact_email: 'PAT@x.com', event_date: '2025-01-01' }),
      P(2, { client_name: 'pat  lee', event_date: '2026-03-01', status: 'Contract Signed' }),
      P(3, { client_name: 'Patricia Lee', contact_email: 'pat@x.com' }),
      P(4, { client_name: 'Sam Roe', contact_phone: '(414) 555-0100' }),
      P(5, { contact_name: 'S. Roe', contact_phone: '414-555-0100' }),
      P(6, { status: 'New Project' })
    ]);
    expect(skipped.map(p => p.project_id)).toEqual(['6']);
    expect(groups).toHaveLength(2);
    const pat = groups.find(g => g.emails.includes('pat@x.com'));
    expect(pat.projects.map(p => p.project_id).sort()).toEqual(['1', '2', '3']);
    expect(pat.signed).toBe(true);
    expect(pat.projects[0].project_id).toBe('2'); // latest first
    const sam = groups.find(g => g !== pat);
    expect(sam.projects).toHaveLength(2);
    expect(sam.signed).toBe(false);
  });

  it('names a client by its most common name, else the project or email', () => {
    const { groups } = groupProjectsIntoClients([
      P(1, { client_name: 'Acme', contact_email: 'a@acme.com' }),
      P(2, { client_name: 'Acme', contact_email: 'a@acme.com' }),
      P(3, { client_name: 'ACME Inc', contact_email: 'a@acme.com' }),
      P(4, { name: 'Pewaukee Home', contact_email: 'home@x.com' })
    ]);
    expect(groups.map(g => g.name).sort()).toEqual(['Acme', 'Pewaukee Home']);
  });
});

describe('planGoodshuffleImport', () => {
  const projects = [
    P(1, { client_name: 'Pat Lee', contact_email: 'pat@x.com', status: 'Contract Signed' }),
    P(2, { client_name: 'Jo Kim', contact_email: 'jo@x.com' }),
    P(3, { client_name: 'Acme Corp', contact_email: 'events@acme.com' }),
    P(4, { client_name: 'New Person', contact_email: 'new@x.com' })
  ];
  const existing = [
    { id: 10, name: 'Patricia Lee', email: 'PAT@x.com' },
    { id: 11, name: 'jo kim', email: null },
    { id: 12, name: 'Acme Corporation', email: null }
  ];
  const contacts = [{ client_id: 12, email: 'events@acme.com' }];

  it('matches by email, contact email, then name', () => {
    const plan = planGoodshuffleImport(projects, existing, contacts);
    expect(plan.matched.map(m => m.client.id).sort()).toEqual([10, 11, 12]);
    expect(plan.newClients.map(g => g.name)).toEqual(['New Person']);
    expect(plan.projectCount).toBe(4);
  });

  it('can leave out clients who never signed', () => {
    const plan = planGoodshuffleImport(projects, [], [], { includeQuoteOnly: false });
    expect(plan.newClients.map(g => g.name)).toEqual(['Pat Lee']);
    expect(plan.leftOut).toBe(3);
    expect(plan.projectCount).toBe(1);
  });
});

describe('rows', () => {
  const group = { name: 'Jo Kim', emails: ['jo@x.com'], phones: ['414-555-0100'], signed: false, projects: [] };

  it('builds a new client, tagging quote-only ones', () => {
    expect(clientRowFromGroup(group)).toEqual({
      name: 'Jo Kim', email: 'jo@x.com', phone: '414-555-0100', source: 'goodshuffle', tags: ['Quote only'], is_active: true
    });
    expect(clientRowFromGroup({ ...group, signed: true }).tags).toEqual([]);
  });

  it('fills only missing fields on an existing client', () => {
    expect(fillMissingClientFields({ email: 'old@x.com', phone: null }, group)).toEqual({ phone: '414-555-0100' });
    expect(fillMissingClientFields({ email: 'a', phone: 'b' }, group)).toEqual({});
  });

  it('builds a project row', () => {
    const row = projectRow(P(231659538, {
      status: 'Contract Signed', name: 'Rebholz', event_date: '2026-11-19', total: 4900, amount_due: 800,
      contact_email: ' INFO@X.ORG ', venue: 'Foxtown Station'
    }), 7);
    expect(row).toMatchObject({
      project_id: '231659538', client_id: 7, status: 'Contract Signed', event_date: '2026-11-19',
      total: 4900, amount_due: 800, contact_email: 'info@x.org', venue: 'Foxtown Station'
    });
    expect(projectRow(P(1, { event_date: '11/19/2026', total: 'x' }), 1)).toMatchObject({ event_date: null, total: null });
    expect(isSignedProject(row)).toBe(true);
  });

  it('chunks lists', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('fetchAllRows', () => {
  it('reads every page', async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const range = vi.fn(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    const { data } = await fetchAllRows(() => ({ range }), 2);
    expect(data).toEqual(all);
    expect(range).toHaveBeenCalledTimes(3);
  });
  it('returns the error', async () => {
    const { data, error } = await fetchAllRows(() => ({ range: async () => ({ data: null, error: { message: 'no' } }) }));
    expect(data).toBeNull();
    expect(error.message).toBe('no');
  });
});
