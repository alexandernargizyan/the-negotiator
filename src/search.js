// @ts-check
import 'dotenv/config';

/**
 * Search module — finds moving companies via Tavily + Google Places
 */

// Twilio credentials — set in .env
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

/**
 * Find moving companies for a given route
 * @param {string} fromLocation - Pickup city/state
 * @param {string} toLocation - Delivery city/state
 * @param {object} [options]
 * @param {number} [options.maxResults=8]
 * @param {string} [options.apiKey] - Override Tavily API key
 * @returns {Promise<Array<{name:string, phone:string, rating:number, reviews:number, address:string}>>}
 */
export async function findMovingCompanies(fromLocation, toLocation, options = {}) {
  const maxResults = options.maxResults || 8;
  const apiKey = options.apiKey || process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set');

  const query = `movers "${fromLocation}" to "${toLocation}" phone number moving company`;

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: maxResults + 3,
      include_domains: [],
      include_answer: false,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Tavily search failed: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  const companies = extractCompaniesFromResults(data.results || []);

  // Deduplicate and limit
  const seen = new Set();
  return companies
    .filter(c => {
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return c.phone;
    })
    .slice(0, maxResults);
}

/**
 * Parse company info from Tavily search results
 */
function extractCompaniesFromResults(results) {
  const companies = [];
  const phoneRe = /(?:\+1|1)?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  for (const r of results) {
    const phones = r.content?.match(phoneRe) || [];
    const nameGuess = guessCompanyName(r.title || r.url || '');

    companies.push({
      name: nameGuess,
      phone: phones[0] ? phones[0].trim() : '',
      rating: parseFloat(r.score) || 0,
      reviews: 0,
      address: r.url || '',
    });
  }

  return companies;
}

/**
 * Try to extract a meaningful company name from a search result title
 */
function guessCompanyName(title) {
  // Remove common suffixes
  const cleaned = title
    .replace(/\s*\|.*$/, '')
    .replace(/\s*-.*$/, '')
    .replace(/\b(phone|number|contact|rating|review)\b.*$/i, '')
    .trim();

  return cleaned || 'Unknown Mover';
}

/**
 * Manual list of known movers (fallback when search yields no phones)
 */
export const KNOWN_COMPANIES = [
  { name: 'Allied Van Lines', phone: '+18004777553', rating: 4.2, reviews: 1200 },
  { name: 'United Van Lines', phone: '+18008783399', rating: 4.1, reviews: 980 },
  { name: 'Two Men and a Truck', phone: '+18003441070', rating: 4.0, reviews: 2100 },
  { name: 'Mayflower Transit', phone: '+18006557494', rating: 4.3, reviews: 560 },
  { name: 'Atlas Van Lines', phone: '+18006379797', rating: 4.0, reviews: 340 },
  { name: 'U-Pack (ABF Freight)', phone: '+18004198212', rating: 4.1, reviews: 780 },
  { name: 'PODS Moving & Storage', phone: '+18007767637', rating: 4.0, reviews: 1500 },
  { name: 'Budget Truck Rental', phone: '+18004627377', rating: 3.8, reviews: 430 },
];
