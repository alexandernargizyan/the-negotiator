// @ts-check
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { JobSpec, createIntakeAgent } from './intake-agent.js';
import { findMovingCompanies, KNOWN_COMPANIES } from './search.js';
import { simulateCall, Quote } from './caller.js';
import { analyzeQuotes, negotiateCallback } from './negotiation.js';
import { generateReport } from './report.js';
import OpenAI from 'openai';

/**
 * The Negotiator — end-to-end orchestrator
 * 
 * Usage: node src/index.js
 * Set API keys in .env before running.
 */

async function main() {
  console.log('🔷 The Negotiator — Hackathon Prototype');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check API keys
  const missing = [];
  if (!process.env.ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.TAVILY_API_KEY) missing.push('TAVILY_API_KEY');
  if (missing.length) {
    console.error('❌ Missing API keys in .env:', missing.join(', '));
    console.error('   Copy .env.example to .env and fill in your keys.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ── Step 1: Demo job spec (bypassing voice intake for CLI demo) ──
  const spec = new JobSpec({
    fromLocation: 'Rock Hill, SC',
    fromZip: '29730',
    toLocation: 'Charlotte, NC',
    toZip: '28202',
    bedrooms: 2,
    largeItems: ['sofa', 'king bed', 'dining table', 'dresser'],
    stairsOrigin: false,
    stairsDest: false,
    elevator: true,
    moveDate: '2026-08-01',
    estimatedCubicFeet: 600,
  });

  console.log('📋 Job Spec:');
  console.log(spec.toString());
  console.log();

  // ── Step 2: Search for moving companies ──
  console.log('🔍 Searching for moving companies...');
  let companies;
  try {
    companies = await findMovingCompanies(spec.fromLocation, spec.toLocation);
  } catch (err) {
    console.warn('⚠️  Search failed, using known companies:', err.message);
    companies = KNOWN_COMPANIES;
  }
  console.log(`   Found ${companies.length} companies`);
  companies.slice(0, 5).forEach(c => console.log(`   • ${c.name} ${c.phone || '(no phone)'}`));
  console.log();

  // ── Step 3: Simulate calls ──
  console.log('📞 Calling companies...');
  const styles = ['hard', 'lowball', 'straight'];
  const quotes = [];

  for (let i = 0; i < Math.min(companies.length, 6); i++) {
    const style = styles[i % styles.length];
    const company = companies[i];
    console.log(`   → Calling ${company.name} (${style} style)...`);
    const quote = await simulateCall(company, spec, openai, style);
    quotes.push(quote);
    console.log(`     ✅ Quote: $${quote.totalPrice.toLocaleString()}`);
  }
  console.log();

  // ── Step 4: Analyze and negotiate ──
  console.log('🧠 Analyzing quotes...');
  const analysis = await analyzeQuotes(quotes);
  console.log(`   🏆 Best: ${analysis.bestDeal?.company || quotes[0].company} — $${analysis.bestDeal?.price || quotes[0].totalPrice}`);
  if (analysis.redFlags.length) {
    console.log('   ⚠️  Red flags:', analysis.redFlags.join('; '));
  }
  console.log();

  // Try negotiating with the second best
  if (quotes.length >= 2) {
    console.log('🔄 Negotiating callback...');
    const target = quotes[1]; // Second cheapest
    const leverage = quotes[0]; // Cheapest
    const result = await negotiateCallback(target, leverage, openai);
    console.log(`   ${result.accepted ? '✅' : '❌'} ${target.company}: $${target.totalPrice} → $${result.newPrice}`);
  }
  console.log();

  // ── Step 5: Generate report ──
  console.log('📊 Generating report...');
  const html = generateReport(quotes, spec, analysis);
  writeFileSync('negotiator-report.html', html, 'utf-8');
  console.log('   ✅ negotiator-report.html saved');
  console.log();
  console.log('✅ Done! Open negotiator-report.html in your browser to view.');

  // Summary for demo
  const sorted = [...quotes].sort((a, b) => a.totalPrice - b.totalPrice);
  console.log('\n━━━ Comparison Summary ━━━');
  sorted.forEach((q, i) => {
    const flag = analysis.redFlags?.some(r => r.includes(q.company)) ? ' ⚠️' : '';
    console.log(`${i === 0 ? ' 🏆' : ` ${i + 1}.`} ${q.company}: $${q.totalPrice.toLocaleString()}${flag}`);
  });
  console.log(`\n💰 Savings range: $${sorted[0].totalPrice.toLocaleString()} – $${sorted[sorted.length-1].totalPrice.toLocaleString()}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
