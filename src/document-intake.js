// @ts-check
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import 'dotenv/config';

/**
 * Document Intake — parses photos, existing quotes, inventory lists
 * via OpenAI Vision. Returns the same JobSpec format as voice intake.
 */

export class ParsedJobSpec {
  constructor(data) {
    this.fromLocation = data.fromLocation || '';
    this.toLocation = data.toLocation || '';
    this.bedrooms = data.bedrooms || 0;
    this.largeItems = data.largeItems || [];
    this.stairsOrigin = !!data.stairsOrigin;
    this.stairsDest = !!data.stairsDest;
    this.elevator = !!data.elevator;
    this.moveDate = data.moveDate || '';
    this.estimatedCubicFeet = data.estimatedCubicFeet || 0;
    this.source = data.source || 'voice'; // 'voice' | 'photo' | 'quote_pdf'
    this.confidence = data.confidence || 0;
  }

  toJSON() { return { ...this }; }
}

/**
 * Extract job spec from a photo of the current home / room
 * @param {string} imagePath - Path to image file (JPEG, PNG)
 * @returns {Promise<ParsedJobSpec>}
 */
export async function parseRoomPhoto(imagePath) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a moving estimator analyzing a photo of a room or home.
Extract visible information:
- Number of bedrooms (estimate from room size, bed if visible)
- Large furniture visible (sofa, bed, table, chairs, wardrobe, piano, treadmill)
- Stairs visible (yes/no, how many flights)
- Elevator visible
- Overall home size estimate (studio, 1BR, 2BR, 3BR, 4+)
- Any fragile/valuable items visible

Output ONLY valid JSON:
{
  "bedrooms": N,
  "largeItems": ["item1", "item2"],
  "stairsOrigin": true/false,
  "elevator": true/false,
  "estimatedHomeSize": "studio|1BR|2BR|3BR|4+",
  "confidence": 0.0-1.0,
  "notes": "any observations"
}`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this photo for a moving estimate. What rooms, furniture, and features do you see?' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'low' } }
        ],
      },
    ],
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });

  const content = resp.choices[0]?.message?.content || '{}';
  const data = JSON.parse(content);

  return new ParsedJobSpec({
    bedrooms: data.bedrooms || 0,
    largeItems: data.largeItems || [],
    stairsOrigin: data.stairsOrigin || false,
    elevator: data.elevator || false,
    estimatedCubicFeet: data.bedrooms ? data.bedrooms * 300 : 0,
    source: 'photo',
    confidence: data.confidence || 0.5,
  });
}

/**
 * Extract job spec from an existing moving quote PDF/image
 * @param {string} imagePath - Path to existing quote (screenshot, scan, PDF page)
 * @returns {Promise<ParsedJobSpec>}
 */
export async function parseExistingQuote(imagePath) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a data extractor analyzing an existing moving quote.
Extract ALL structured information visible:
- FROM location (city, state, ZIP)
- TO location (city, state, ZIP)
- Move date
- Home size (bedrooms, sqft)
- Services included (packing, loading, transport, unloading, assembly)
- PRICE BREAKDOWN with every line item and dollar amount
- Company name, USDOT number if visible
- Any fine print, disclaimers, or expiration date

Output ONLY valid JSON:
{
  "fromLocation": "",
  "toLocation": "",
  "moveDate": "",
  "bedrooms": N,
  "companyName": "",
  "priceBreakdown": {"base": 0, "packing": 0, "stairs": 0, "fuel": 0, "insurance": 0, "total": 0},
  "terms": "any restrictions, expiration, fine print",
  "confidence": 0.0-1.0
}`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all data from this moving quote.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}`, detail: 'high' } }
        ],
      },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = resp.choices[0]?.message?.content || '{}';
  const data = JSON.parse(content);

  const spec = new ParsedJobSpec({
    fromLocation: data.fromLocation || '',
    toLocation: data.toLocation || '',
    moveDate: data.moveDate || '',
    bedrooms: data.bedrooms || 0,
    source: 'quote_pdf',
    confidence: data.confidence || 0.5,
  });

  // Also return the extracted quote data alongside the spec
  spec._extractedQuote = data.priceBreakdown || {};
  spec._extractedCompany = data.companyName || '';
  spec._extractedTerms = data.terms || '';

  return spec;
}

/**
 * Merge voice intake spec with document intake spec
 * Document data takes priority for fields it detected;
 * voice data fills in gaps.
 * @param {ParsedJobSpec} voiceSpec
 * @param {ParsedJobSpec} docSpec
 * @returns {ParsedJobSpec}
 */
export function mergeSpecs(voiceSpec, docSpec) {
  return new ParsedJobSpec({
    fromLocation: docSpec.fromLocation || voiceSpec.fromLocation,
    toLocation: docSpec.toLocation || voiceSpec.toLocation,
    bedrooms: docSpec.bedrooms || voiceSpec.bedrooms,
    largeItems: docSpec.largeItems.length ? docSpec.largeItems : voiceSpec.largeItems,
    stairsOrigin: docSpec.stairsOrigin || voiceSpec.stairsOrigin,
    stairsDest: docSpec.stairsDest || voiceSpec.stairsDest,
    elevator: docSpec.elevator || voiceSpec.elevator,
    moveDate: docSpec.moveDate || voiceSpec.moveDate,
    estimatedCubicFeet: docSpec.estimatedCubicFeet || voiceSpec.estimatedCubicFeet,
    source: 'merged (voice + ' + docSpec.source + ')',
    confidence: Math.min(1, voiceSpec.confidence + docSpec.confidence),
  });
}
