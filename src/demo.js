#!/usr/bin/env node
/**
 * Demo script — runs with hardcoded quotes, no API keys needed
 * Shows the complete flow and report generation.
 */

import { writeFileSync } from 'fs';
import { JobSpec } from './intake-agent.js';
import { Quote } from './caller.js';
import { generateReport } from './report.js';

console.log('🔷 The Negotiator — Demo Mode (no API keys needed)\n');

// Demo job spec
const spec = new JobSpec({
  fromLocation: 'Rock Hill, SC',
  fromZip: '29730',
  toLocation: 'Charlotte, NC',
  toZip: '28202',
  bedrooms: 2,
  largeItems: ['sofa', 'king bed', 'dining table'],
  stairsOrigin: false,
  stairsDest: true,
  elevator: false,
  moveDate: '2026-08-01',
  estimatedCubicFeet: 600,
});

console.log('📋 Moving from Rock Hill, SC → Charlotte, NC');
console.log('   2-bedroom, stairs at destination\n');

// Demo quotes (simulated realistic data)
const quotes = [
  new Quote({
    company: 'QuickMove Pro',
    basePrice: 1600,
    packingFee: 0,
    stairsFee: 0,
    fuelFee: 100,
    insuranceFee: 0,
    totalPrice: 1700,
    notes: 'Negotiated down from $2,000 after matching competitor',
    negotiationResult: 'price_dropped',
  }),
  new Quote({
    company: 'Allied Van Lines',
    basePrice: 1500,
    packingFee: 200,
    stairsFee: 300,
    fuelFee: 100,
    insuranceFee: 0,
    totalPrice: 2100,
    notes: 'Itemised quote, professional, no-haggle pricing',
    negotiationResult: 'no_negotiation',
  }),
  new Quote({
    company: 'Two Men and a Truck',
    basePrice: 1850,
    packingFee: 0,
    stairsFee: 250,
    fuelFee: 150,
    insuranceFee: 0,
    totalPrice: 2250,
    notes: 'Higher base but waived packing fee',
    negotiationResult: 'no_negotiation',
  }),
  new Quote({
    company: 'Budget Movers',
    basePrice: 1200,
    packingFee: 400,
    stairsFee: 350,
    fuelFee: 200,
    insuranceFee: 0,
    totalPrice: 2150,
    notes: 'Low base but heavy add-ons — potential lowball',
    negotiationResult: 'no_negotiation',
  }),
  new Quote({
    company: 'Atlas Van Lines',
    basePrice: 1700,
    packingFee: 150,
    stairsFee: 200,
    fuelFee: 100,
    insuranceFee: 50,
    totalPrice: 2200,
    notes: 'Best insurance terms, recommended for valuables',
    negotiationResult: 'no_negotiation',
  }),
];

console.log('📞 Quotes collected:');
quotes.forEach((q, i) => console.log(`   ${i + 1}. ${q.company}: $${q.totalPrice.toLocaleString()}`));

const analysis = {
  bestDeal: { company: 'QuickMove Pro', price: 1700, reason: 'Best value, negotiated down 15%' },
  redFlags: ['Budget Movers — 35% above market with hidden fees / lowball base'],
  strategy: 'Call Atlas Van Lines: "QuickMove Pro offered $1,700 — can you do better? If not, we go with them."',
};

console.log('\n🏆 Best deal:', analysis.bestDeal.company, '– $' + analysis.bestDeal.price);
console.log('⚠️  Red flags:', analysis.redFlags[0]);
console.log('💡 Strategy:', analysis.strategy);

const html = generateReport(quotes, spec, analysis);
writeFileSync('negotiator-report.html', html, 'utf-8');
console.log('\n✅ negotiator-report.html generated — open in browser to view');
