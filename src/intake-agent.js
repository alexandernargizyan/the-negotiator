// @ts-check
import 'dotenv/config';

/**
 * Intake Agent — captures customer's moving needs via ElevenLabs Conversational AI
 * 
 * This module configures an ElevenLabs conversational agent that conducts
 * a voice interview to build a structured job spec.
 */

/** Schema for a moving job specification */
export class JobSpec {
  constructor(data) {
    /** Pickup address (city, state) */
    this.fromLocation = data.fromLocation || '';
    this.fromZip = data.fromZip || '';
    /** Delivery address */
    this.toLocation = data.toLocation || '';
    this.toZip = data.toZip || '';
    /** Number of bedrooms (proxy for truck size) */
    this.bedrooms = data.bedrooms || 0;
    /** List of large furniture items */
    this.largeItems = data.largeItems || [];
    /** Stairs at origin */
    this.stairsOrigin = !!data.stairsOrigin;
    /** Stairs at destination */
    this.stairsDest = !!data.stairsDest;
    /** Elevator available? */
    this.elevator = !!data.elevator;
    /** Desired move date (YYYY-MM-DD) */
    this.moveDate = data.moveDate || '';
    /** Estimated total cubic feet (approximate) */
    this.estimatedCubicFeet = data.estimatedCubicFeet || 0;
  }

  toJSON() {
    return { ...this };
  }

  toString() {
    return [
      `Move: ${this.fromLocation} → ${this.toLocation}`,
      `Bedrooms: ${this.bedrooms}, Large items: ${this.largeItems.length}`,
      `Stairs: origin=${this.stairsOrigin}, dest=${this.stairsDest}, elevator=${this.elevator}`,
      `Move date: ${this.moveDate}, Est. ${this.estimatedCubicFeet} cu.ft.`,
    ].join('\n');
  }
}

/**
 * Default system prompt for the ElevenLabs intake agent
 */
export const INTAKE_SYSTEM_PROMPT = `You are a professional moving estimator conducting a phone interview.

Your job is to gather ALL of the following information from the customer:

1. **Where is the move?** — From which city/state to which city/state? (Get ZIP codes if possible)
2. **How many bedrooms?** — Studio? 1BR? 2BR? 3BR? 4+? (Proxy for truck size)
3. **Large furniture items** — Sofa? Bed? Dining table? Piano? Treadmill? Safe? Anything fragile?
4. **Stairs or elevator?** — Are there stairs at either the pickup or delivery location? How many flights?
5. **Move date** — When do they need to move? Is it flexible?
6. **Special requirements** — Parking permits? Long carry distance? Loading dock?

Guidelines:
- Ask ONE question at a time. Don't overwhelm.
- Be conversational and friendly. "So where are we moving from and to?"
- If they're unsure about something, give a reasonable default or ask for the best guess.
- After gathering all info, present a clear summary to the customer and ask them to confirm.
- Once confirmed, output the job specification as a JSON object.
- Do NOT make up pricing or commitments. You only gather requirements.
- If the customer asks about pricing, say "I'll be calling several moving companies to get you the best price after we finish this."`;

/**
 * ElevenLabs agent configuration for the intake agent
 * @param {string} apiKey - ElevenLabs API key
 * @returns {Promise<object>} Created agent response
 */
export async function createIntakeAgent(apiKey) {
  const resp = await fetch('https://api.elevenlabs.io/v1/convai/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      name: 'MoveEstimator',
      conversation_config: {
        agent: {
          prompt: {
            prompt: INTAKE_SYSTEM_PROMPT,
          },
          first_message: `Hi! I'm your moving assistant. I'll help you get the best deal from multiple moving companies. Let's start — where are you moving from and to?`,
          language: 'en',
        },
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ElevenLabs createAgent failed: ${resp.status} ${err}`);
  }

  return resp.json();
}

/**
 * Extract structured spec from ElevenLabs agent conversation transcript
 * @param {string} transcript - Full conversation transcript
 * @returns {JobSpec} Extracted job spec
 */
export function extractSpecFromTranscript(transcript) {
  // Try to find JSON in the transcript (agent outputs it on confirmation)
  const jsonMatch = transcript.match(/\{(?:[^{}]|"(?:[^"\\]|\\.)*")*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return new JobSpec(parsed);
    } catch { /* fall through to NLP extraction */ }
  }

  // Simple keyword extraction fallback
  const spec = new JobSpec({});
  const t = transcript.toLowerCase();

  const fromMatch = t.match(/from\s+([\w\s,]+?)(?:\s+to|\s*$)/);
  if (fromMatch) spec.fromLocation = fromMatch[1].trim();

  const rooms = t.match(/(\d+)\s*(?:bedroom|br|room|bed)/);
  if (rooms) spec.bedrooms = parseInt(rooms[1]);

  if (/stairs/i.test(t)) spec.stairsOrigin = true;
  if (/elevator/i.test(t)) spec.elevator = true;

  const dateMatch = t.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) spec.moveDate = dateMatch[1];

  return spec;
}
