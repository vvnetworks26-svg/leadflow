/**
 * scripts/seed-widget-tenant.ts
 *
 * Creates one Organization + Business so the widget chat endpoint is
 * curl-testable end-to-end. Idempotent — safe to re-run.
 *
 * Usage:
 *   MONGODB_URI=<uri> npx tsx scripts/seed-widget-tenant.ts
 */

import mongoose from 'mongoose';
import { OrganizationModel } from '../src/models/Organization.model';
import { BusinessModel } from '../src/models/Business.model';

const SLUG = 'acme-hvac';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);

  let org = await OrganizationModel.findOne({ slug: SLUG });
  if (!org) {
    org = await OrganizationModel.create({
      name: 'Acme HVAC',
      slug: SLUG,
      industry: 'HVAC',
      status: 'active',
    });
  }

  const existingBiz = await BusinessModel.findOne({ organizationId: org.id });
  if (!existingBiz) {
    await BusinessModel.create({
      organizationId: org.id,
      companyName: 'Acme HVAC',
      email: 'hello@acmehvac.test',
      phone: '555-010-2000',
      industry: 'HVAC',
      services: [
        { id: 'svc-1', name: 'AC Repair', description: 'Repair and diagnostics', estimatedDuration: 60, emergencyAvailable: true, active: true },
        { id: 'svc-2', name: 'Furnace Installation', description: 'New system install', estimatedDuration: 240, emergencyAvailable: false, active: true },
      ],
      aiConfig: {
        welcomeMessage: 'Hi! Thanks for reaching out to Acme HVAC. How can I help you today?',
        tone: 'Friendly',
        enableEmergencyWorkflow: true,
      },
    });
  }

  console.log(`Seeded organization: id=${org.id} slug=${org.slug}`);
  console.log(`Widget token (use as :token in /api/v1/widget/:token/...): ${org.slug}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
