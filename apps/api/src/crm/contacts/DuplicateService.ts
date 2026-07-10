/**
 * DuplicateService.ts
 *
 * Detects potential duplicate leads and contacts.
 * Never silently merges — always suggests to the user.
 *
 * Detection criteria:
 *   1. Exact email match
 *   2. Exact phone match (digit-normalized)
 *   3. Similar name + company (fuzzy)
 */

import { LeadModel }    from '../../models/Lead.model';
import { ContactModel } from '../../models/Contact.model';
import type { ILead }   from '../../models/Lead.model';

export interface DuplicateCandidate {
  id:        string;
  name:      string;
  email:     string;
  phone:     string;
  company?:  string;
  reason:    'email' | 'phone' | 'name_company';
  score:     number;    // similarity 0–100
}

export interface DuplicateDetectionResult {
  hasDuplicates: boolean;
  candidates:    DuplicateCandidate[];
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function nameSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 100;
  // Token overlap
  const ta = new Set(la.split(/\s+/));
  const tb = new Set(lb.split(/\s+/));
  const intersection = [...ta].filter(t => tb.has(t)).length;
  return Math.round((intersection / Math.max(ta.size, tb.size)) * 100);
}

export const DuplicateService = {

  /** Find duplicate leads for a candidate lead record. */
  async findLeadDuplicates(
    organizationId: string,
    candidate: { name: string; email?: string; phone: string; company?: string },
    excludeId?: string,
  ): Promise<DuplicateDetectionResult> {
    const candidates: DuplicateCandidate[] = [];
    const normalizedPhone = normalizePhone(candidate.phone);
    const seen = new Set<string>();

    const orClauses: Record<string, unknown>[] = [];
    if (candidate.email && candidate.email.trim())
      orClauses.push({ email: candidate.email.toLowerCase().trim() });
    if (normalizedPhone.length >= 7)
      orClauses.push({ phone: { $regex: normalizedPhone.slice(-7) } });

    if (orClauses.length > 0) {
      const exactMatches = await LeadModel.find({
        organizationId,
        $or: orClauses,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      }).limit(10).lean();

      for (const lead of exactMatches) {
        const id = lead._id.toString();
        if (seen.has(id)) continue;
        seen.add(id);

        const emailMatch = candidate.email &&
          lead.email?.toLowerCase() === candidate.email.toLowerCase();
        const phoneMatch = normalizePhone(lead.phone ?? '').slice(-7) === normalizedPhone.slice(-7);

        candidates.push({
          id,
          name:    lead.name,
          email:   lead.email ?? '',
          phone:   lead.phone ?? '',
          company: (lead as any).company,
          reason:  emailMatch ? 'email' : 'phone',
          score:   emailMatch ? 95 : 85,
        });
      }
    }

    // Fuzzy name + company match
    if (candidate.company) {
      const nameMatches = await LeadModel.find({
        organizationId,
        name: { $regex: new RegExp(candidate.name.split(' ')[0], 'i') },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      }).limit(20).lean();

      for (const lead of nameMatches) {
        const id = lead._id.toString();
        if (seen.has(id)) continue;
        const nameSim = nameSimilarity(lead.name, candidate.name);
        const compSim = nameSimilarity((lead as any).company ?? '', candidate.company ?? '');
        const combinedScore = Math.round((nameSim + compSim) / 2);
        if (combinedScore >= 70) {
          seen.add(id);
          candidates.push({
            id,
            name:    lead.name,
            email:   lead.email ?? '',
            phone:   lead.phone ?? '',
            company: (lead as any).company,
            reason:  'name_company',
            score:   combinedScore,
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    return { hasDuplicates: candidates.length > 0, candidates: candidates.slice(0, 5) };
  },

  /** Merge sourceLeadId into targetLeadId. Target keeps identity. */
  async mergeLeads(
    organizationId: string,
    targetId:       string,
    sourceId:       string,
  ): Promise<ILead> {
    const [target, source] = await Promise.all([
      LeadModel.findOne({ _id: targetId, organizationId }),
      LeadModel.findOne({ _id: sourceId, organizationId }),
    ]);
    if (!target) throw new Error('Target lead not found');
    if (!source) throw new Error('Source lead not found');

    // Merge non-empty fields from source into target
    const patch: Record<string, unknown> = {};
    if (!target.email  && source.email)   patch.email  = source.email;
    if (!target.company && (source as any).company) patch.company = (source as any).company;
    if ((target.score ?? 0) < (source.score ?? 0)) patch.score = source.score;
    if (source.notes)  patch.notes = [target.notes, source.notes].filter(Boolean).join('\n\n---\n');
    if (source.tags?.length) patch.tags = [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])];

    // Track merged ID history
    patch.mergedIds = [...(target.mergedIds ?? []), sourceId];

    await LeadModel.findByIdAndUpdate(targetId, patch);
    await LeadModel.findByIdAndUpdate(sourceId, { duplicateOfId: targetId });

    return (await LeadModel.findById(targetId))!.toJSON() as unknown as ILead;
  },

  /** Find duplicate contacts by email or phone. */
  async findContactDuplicates(
    organizationId: string,
    emails: string[],
    phones: string[],
  ) {
    const orClauses: Record<string, unknown>[] = [];
    if (emails.length) orClauses.push({ emails: { $in: emails } });
    if (phones.length) orClauses.push({ phones: { $in: phones } });
    if (!orClauses.length) return [];
    return ContactModel.find({ organizationId, $or: orClauses }).limit(10).lean();
  },
};
