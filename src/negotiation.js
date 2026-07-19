// @ts-check
import OpenAI from 'openai';
import 'dotenv/config';

/**
 * Negotiation engine — analyses quotes, finds leverage, drives price down
 */

/**
 * Analyze quotes and generate negotiation strategy
 * @param {Array<import('./caller.js').Quote>} quotes
 * @returns {Promise<{analysis: string, bestDeal: object, redFlags: string[], strategy: string}>}
 */
export async function analyzeQuotes(quotes) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const sorted = [...quotes].sort((a, b) => a.totalPrice - b.totalPrice);
  const avg = quotes.reduce((s, q) => s + q.totalPrice, 0) / quotes.length;

  const prompt = `You are a negotiation analyst for a customer looking to hire a moving company.

Here are the quotes collected:

${quotes.map((q, i) => `QUOTE #${i + 1}: ${q.company}
  Base: $${q.basePrice} | Packing: $${q.packingFee} | Stairs: $${q.stairsFee} | Fuel: $${q.fuelFee} | Insurance: $${q.insuranceFee}
  Total: $${q.totalPrice}
  Notes: ${q.notes?.substring(0, 200)}
`).join('\n')}

Average total: $${Math.round(avg)}
Lowest total: $${sorted[0]?.totalPrice || 0} (${sorted[0]?.company || '?'})
Highest total: $${sorted[sorted.length - 1]?.totalPrice || 0} (${sorted[sorted.length - 1]?.company || '?'})

Tasks:
1. Identify any red flags (prices 30%+ below avg = potential lowball with hidden fees)
2. Determine which company to recommend (best value, not just cheapest)
3. Suggest leverage for negotiation: which quote to use as bargaining chip with which company
4. Write a short negotiation script the agent can use on a callback

Output JSON format:
{
  "redFlags": ["Company X — 35% below average, possible lowball"],
  "recommendation": { "company": "...", "price": N, "reason": "..." },
  "leverageSuggestion": "Call {company} and mention you have a quote for $X from {competitor}",
  "negotiationScript": "Hi, we received a quote for...",
  "expectedSaving": N
}`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a negotiation analyst. Output valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = resp.choices[0]?.message?.content || '{}';
  const result = JSON.parse(content);

  return {
    analysis: content,
    bestDeal: result.recommendation || sorted[0],
    redFlags: result.redFlags || [],
    strategy: result.negotiationScript || '',
  };
}

/**
 * Simulate a negotiation callback leveraging competing quotes
 * @param {import('./caller.js').Quote} targetCompany - Company to call back
 * @param {import('./caller.js').Quote} leverageQuote - Cheaper competitor's quote
 * @param {object} openai
 * @returns {Promise<{newPrice: number, accepted: boolean, transcript: string}>}
 */
export async function negotiateCallback(targetCompany, leverageQuote, openai) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a moving company dispatcher at ${targetCompany.company}. Your current quote was $${targetCompany.totalPrice}. A customer is calling back with a competitor's quote. You can negotiate — offer discounts to win the job but don't go below your cost. Be realistic: you can reduce 5-15% if pushed. Your tone is professional. Respond as the dispatcher.`
      },
      {
        role: 'user',
        content: `Hi, this is Alex's assistant. We got a quote from ${leverageQuote.company} for $${leverageQuote.totalPrice}, all-in. That's significantly lower than your $${targetCompany.totalPrice}. Can you match or beat it?`
      },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  const transcript = resp.choices[0]?.message?.content || '';
  const accepted = transcript.toLowerCase().includes('yes') || transcript.toLowerCase().includes('can do') || transcript.toLowerCase().includes('i can');
  const newPrice = extractPrice(transcript);

  return {
    newPrice: newPrice || targetCompany.totalPrice,
    accepted,
    transcript,
  };
}

function extractPrice(text) {
  const m = text.match(/\$([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, '')) : 0;
}
