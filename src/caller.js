// @ts-check
import 'dotenv/config';

/**
 * Caller module — makes outbound calls to moving companies via ElevenLabs
 * or runs simulated calls (for hackathon demo without real phone numbers)
 */

/**
 * Structured quote extracted from a call
 */
export class Quote {
  constructor({ company, basePrice, packingFee, stairsFee, fuelFee, insuranceFee, totalPrice, notes, negotiationResult }) {
    this.company = company;
    this.basePrice = basePrice || 0;
    this.packingFee = packingFee || 0;
    this.stairsFee = stairsFee || 0;
    this.fuelFee = fuelFee || 0;
    this.insuranceFee = insuranceFee || 0;
    this.totalPrice = totalPrice || (basePrice || 0) + (packingFee || 0) + (stairsFee || 0) + (fuelFee || 0) + (insuranceFee || 0);
    this.notes = notes || '';
    this.negotiationResult = negotiationResult || '';
    this.priceChanged = !!negotiationResult && negotiationResult !== 'no_negotiation';
  }

  itemizedLines() {
    const lines = [`Base: $${this.basePrice}`];
    if (this.packingFee) lines.push(`Packing: $${this.packingFee}`);
    if (this.stairsFee) lines.push(`Stairs: $${this.stairsFee}`);
    if (this.fuelFee) lines.push(`Fuel: $${this.fuelFee}`);
    if (this.insuranceFee) lines.push(`Insurance: $${this.insuranceFee}`);
    lines.push(`Total: $${this.totalPrice}`);
    return lines;
  }
}

/**
 * Caller agent system prompt (used for ElevenLabs outbound agent)
 * Describes the job identically every time for fair comparison
 */
export function buildCallerPrompt(jobSpec) {
  return `You are a professional moving coordinator calling moving companies on behalf of your customer.

Your customer's move details:
- From: ${jobSpec.fromLocation}${jobSpec.fromZip ? ` (${jobSpec.fromZip})` : ''}
- To: ${jobSpec.toLocation}${jobSpec.toZip ? ` (${jobSpec.toZip})` : ''}
- ${jobSpec.bedrooms} bedroom home
- Large items: ${jobSpec.largeItems.join(', ') || 'standard furniture'}
- Stairs at origin: ${jobSpec.stairsOrigin ? 'Yes' : 'No'}
- Stairs at destination: ${jobSpec.stairsDest ? 'Yes' : 'No'}
- Elevator available: ${jobSpec.elevator ? 'Yes' : 'No'}
- Move date: ${jobSpec.moveDate || 'Flexible (within 30 days)'}

Instructions:
1. Identify yourself: "Hi, I'm calling from [your company], I'm an AI assistant helping a customer with their upcoming move."
2. Describe the job using EXACTLY the details above — do not embellish or change anything.
3. Ask for an itemised quote: base price, packing cost (if any), stairs fee, fuel surcharge, insurance.
4. After getting the quote, say "I understand. Thank you for the quote."
5. If they refuse to give a price without seeing the place, ask for a rough estimate over the phone.
6. If they ask personal questions, politely decline.
7. End the call professionally.
8. OUTPUT the structured quote as JSON at the end.`;
}

/**
 * Simulate a call to a moving company using OpenAI
 * (For hackathon demo — replaces real outbound calling)
 * 
 * @param {object} company - {name, phone, rating}
 * @param {object} jobSpec - JobSpec instance
 * @param {object} openai - OpenAI client instance
 * @param {string} role - Counterparty style: 'hard', 'lowball', 'straight'
 * @returns {Promise<Quote>}
 */
export async function simulateCall(company, jobSpec, openai, role = 'straight') {
  const roleDescriptions = {
    hard: `You're a busy, no-nonsense moving company dispatcher. You give a high base price upfront and add fees aggressively. You don't offer discounts easily. Your tone is curt but professional. Base price: $${1000 + Math.floor(Math.random() * 500)}. Stairs are always extra.`,
    lowball: `You're a small moving company trying to undercut everyone. You give a very low base price ($${600 + Math.floor(Math.random() * 300)}) but add huge fees for everything else — packing, stairs, fuel, insurance. You don't mention fees unless asked. Your tone is friendly and eager.`,
    straight: `You're an honest, transparent moving company. You give competitive pricing with clear itemised fees. You're willing to negotiate a bit if the customer pushes. Base price: $${1000 + Math.floor(Math.random() * 600)}. Your tone is professional and helpful.`,
  };

  const callerInfo = buildCallerPrompt(jobSpec);

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: roleDescriptions[role] || roleDescriptions.straight },
      { role: 'user', content: `[Caller] ${callerInfo}\n\n[You answer the phone. Go.]` },
    ],
    temperature: 0.8,
    max_tokens: 400,
  });

  const reply = resp.choices[0]?.message?.content || '';
  const basePrice = extractPrice(reply, 'base');
  const totalPrice = extractPrice(reply, 'total');
  const packing = extractPrice(reply, 'packing');
  const stairs = extractPrice(reply, 'stairs');
  const fuel = extractPrice(reply, 'fuel');
  const insurance = extractPrice(reply, 'insurance');

  return new Quote({
    company: company.name,
    basePrice: basePrice || Math.floor(1200 + Math.random() * 600),
    packingFee: packing || Math.floor(Math.random() * 300),
    stairsFee: stairs || Math.floor(Math.random() * 400),
    fuelFee: fuel || Math.floor(Math.random() * 200),
    insuranceFee: insurance || 0,
    totalPrice: totalPrice || totalPrice || 0,
    notes: reply.substring(0, 500),
    negotiationResult: 'no_negotiation',
  });
}

function extractPrice(text, label) {
  // Match patterns like "base price: $1,200" or "total: $1,500" or "base: 1200"
  const re = new RegExp(`${label}[:\\s]*(?:price|fee|cost|surcharge)?[:\\s]*\\$?([\\d,]+)`, 'i');
  const m = text.match(re);
  if (m) return parseInt(m[1].replace(/,/g, ''));
  const m2 = text.match(new RegExp(`\\$([\\d,]+).*?${label}`, 'i'));
  if (m2) return parseInt(m2[1].replace(/,/g, ''));
  return 0;
}
