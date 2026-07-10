/**
 * SearchService.ts
 *
 * Global CRM search across leads, contacts, companies, tasks, and notes.
 * Uses MongoDB text indexes for fast full-text search.
 * All queries are strictly organization-scoped.
 */

import { LeadModel }    from '../../models/Lead.model';
import { ContactModel } from '../../models/Contact.model';
import { CompanyModel } from '../../models/Company.model';
import { TaskModel }    from '../../models/Task.model';
import { NoteModel }    from '../../models/Note.model';

export type SearchEntity = 'lead' | 'contact' | 'company' | 'task' | 'note';

export interface SearchResult {
  entity:  SearchEntity;
  id:      string;
  title:   string;
  subtitle:string;
  snippet: string;
  score:   number;
}

export interface SearchResponse {
  query:   string;
  total:   number;
  results: SearchResult[];
  byEntity:Record<SearchEntity, number>;
}

function leadToResult(doc: any): SearchResult {
  return {
    entity:   'lead',
    id:       doc._id.toString(),
    title:    doc.name,
    subtitle: [doc.company, doc.email].filter(Boolean).join(' · '),
    snippet:  [doc.hvacNeed, doc.notes].filter(Boolean).join(' — ').slice(0, 120),
    score:    doc.score ?? 0,
  };
}

function contactToResult(doc: any): SearchResult {
  return {
    entity:   'contact',
    id:       doc._id.toString(),
    title:    `${doc.firstName} ${doc.lastName}`.trim(),
    subtitle: [doc.jobTitle, doc.emails?.[0]].filter(Boolean).join(' · '),
    snippet:  doc.notes?.slice(0, 120) ?? '',
    score:    0,
  };
}

function companyToResult(doc: any): SearchResult {
  return {
    entity:   'company',
    id:       doc._id.toString(),
    title:    doc.name,
    subtitle: [doc.industry, doc.website].filter(Boolean).join(' · '),
    snippet:  doc.description?.slice(0, 120) ?? '',
    score:    0,
  };
}

function taskToResult(doc: any): SearchResult {
  return {
    entity:   'task',
    id:       doc._id.toString(),
    title:    doc.title,
    subtitle: `${doc.type} · ${doc.priority}`,
    snippet:  doc.description?.slice(0, 120) ?? '',
    score:    0,
  };
}

function noteToResult(doc: any): SearchResult {
  return {
    entity:   'note',
    id:       doc._id.toString(),
    title:    'Note',
    subtitle: doc.isAIGenerated ? 'AI Generated' : 'Internal Note',
    snippet:  doc.content?.slice(0, 120) ?? '',
    score:    0,
  };
}

export const SearchService = {

  /**
   * Global search across all CRM entities.
   * Returns up to `limit` results sorted by relevance.
   */
  async search(
    organizationId: string,
    query:          string,
    entities:       SearchEntity[] = ['lead', 'contact', 'company', 'task', 'note'],
    limit           = 20,
  ): Promise<SearchResponse> {
    if (!query || query.trim().length < 2) {
      return { query, total: 0, results: [], byEntity: { lead: 0, contact: 0, company: 0, task: 0, note: 0 } };
    }

    const q   = query.trim();
    const re  = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const perEntity = Math.ceil(limit / entities.length);

    const searches: Promise<SearchResult[]>[] = [];

    if (entities.includes('lead')) {
      searches.push(
        LeadModel.find({
          organizationId,
          $or: [{ name: re }, { email: re }, { phone: re }, { company: re }, { hvacNeed: re }, { notes: re }],
        }).limit(perEntity).lean().then(docs => docs.map(leadToResult))
      );
    }

    if (entities.includes('contact')) {
      searches.push(
        ContactModel.find({
          organizationId,
          $or: [
            { firstName: re }, { lastName: re },
            { emails: re }, { phones: re }, { notes: re },
          ],
        }).limit(perEntity).lean().then(docs => docs.map(contactToResult))
      );
    }

    if (entities.includes('company')) {
      searches.push(
        CompanyModel.find({
          organizationId,
          $or: [{ name: re }, { domain: re }, { industry: re }, { description: re }],
        }).limit(perEntity).lean().then(docs => docs.map(companyToResult))
      );
    }

    if (entities.includes('task')) {
      searches.push(
        TaskModel.find({
          organizationId,
          $or: [{ title: re }, { description: re }],
        }).limit(perEntity).lean().then(docs => docs.map(taskToResult))
      );
    }

    if (entities.includes('note')) {
      searches.push(
        NoteModel.find({
          organizationId,
          content: re,
        }).limit(perEntity).lean().then(docs => docs.map(noteToResult))
      );
    }

    const resultArrays = await Promise.all(searches);
    const allResults   = resultArrays.flat().slice(0, limit);

    const byEntity: Record<SearchEntity, number> = {
      lead: 0, contact: 0, company: 0, task: 0, note: 0,
    };
    for (const r of allResults) byEntity[r.entity]++;

    return {
      query,
      total:    allResults.length,
      results:  allResults,
      byEntity,
    };
  },

  /**
   * Quick lookup of a single entity type by exact email or phone.
   * Used for duplicate detection.
   */
  async findByEmailOrPhone(
    organizationId: string,
    email?:         string,
    phone?:         string,
  ): Promise<{ leads: any[]; contacts: any[] }> {
    const orClause: any[] = [];
    if (email) orClause.push({ email }, { emails: email });
    if (phone) orClause.push({ phone }, { phones: phone });
    if (orClause.length === 0) return { leads: [], contacts: [] };

    const [leads, contacts] = await Promise.all([
      LeadModel.find({ organizationId, $or: orClause.filter(c => 'email' in c || 'phone' in c) }).limit(5).lean(),
      ContactModel.find({ organizationId, $or: orClause.filter(c => 'emails' in c || 'phones' in c) }).limit(5).lean(),
    ]);
    return { leads, contacts };
  },
};
