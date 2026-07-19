// @ts-check
import 'dotenv/config';
import { writeFileSync } from 'fs';
import OpenAI from 'openai';

/**
 * Two-agent demo bridge:
 * Uses OpenAI GPT to generate dialogue between Caller and Operator,
 * then uses ElevenLabs TTS to speak each line with the right voice.
 * 
 * Usage: node src/two-agent-demo.js
 * Output: logs transcript, generates audio files (optional)
 */

const CALLER_VOICE_ID = 'N2lVS1w4EtoT3dr4eOWO'; // Callum (male)
const OPERATOR_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah (female)
const SYSTEM_PROMPT = `You write a dialogue between two AI agents for a hackathon demo.

AGENT 1 - CALLER (voice: Callum, male, British accent)
An AI assistant that calls moving companies on behalf of a customer.
- Polite, professional, thorough
- Describes the job using exact customer details
- Asks for itemized pricing
- Uses leverage: "I have a competing quote for $X"
- Negotiates professionally
- Tracks the best price

AGENT 2 - OPERATOR (voice: Sarah, female, British accent)
A moving company sales representative.
- Professional but sounds like a real person
- Uses filler words: "well", "let me see", "okay"
- Gives itemized quotes
- Can be hard negotiator (high prices), lowballer (low base + fees), or straight shooter (fair)
- When pressured with competing quotes, can reduce 5-15%

SCENARIO:
Customer: moving from Rock Hill, SC to Charlotte, NC. 2-bedroom apartment with sofa, king bed, dining table. Stairs at destination (1 flight). Elevator not available. Move date: August 1st.

DEMO STRUCTURE:
1. CALLER opens: "Hello, I'm calling about a customer moving..."
2. OPERATOR answers and gives a quote (pick a style - hard negotiator)
3. CALLER asks for itemized breakdown
4. CALLER drops leverage: competing quote for $1,850
5. OPERATOR responds - may reduce price
6. CALLER pushes further
7. OPERATOR gives final best price
8. CALLER summarizes and thanks

Output format for EACH turn:
CALLER: [text]
OPERATOR: [text]

Start with CALLER. Maximum 6 rounds total. Make the negotiation realistic - the price should measurably change.`;

/**
 * Call ElevenLabs TTS to generate audio
 */
async function speak(text, voiceId, turnNum, speaker) {
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    console.warn(`  ⚠️  TTS failed (${resp.status}), continuing without audio`);
    return null;
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const filename = `turn-${String(turnNum).padStart(2, '0')}-${speaker}.mp3`;
  writeFileSync(filename, buffer);
  return filename;
}

/**
 * Generate dialogue using OpenAI GPT
 */
async function generateDialogue(openai) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Generate the dialogue. Start with CALLER. Maximum 6 rounds. Make the price change due to leverage.' },
  ];

  const turns = [];
  let round = 0;

  while (round < 8) {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.8,
      max_tokens: 500,
    });

    const content = resp.choices[0]?.message?.content || '';
    if (!content) break;

    messages.push({ role: 'assistant', content });

    // Parse CALLER and OPERATOR lines
    const lines = content.split('\n');
    let parsedAny = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('CALLER:')) {
        const text = trimmed.replace(/^CALLER:\s*/i, '').trim();
        if (text) {
          turns.push({ speaker: 'CALLER', text, voiceId: CALLER_VOICE_ID });
          parsedAny = true;
        }
      } else if (trimmed.startsWith('OPERATOR:')) {
        const text = trimmed.replace(/^OPERATOR:\s*/i, '').trim();
        if (text) {
          turns.push({ speaker: 'OPERATOR', text, voiceId: OPERATOR_VOICE_ID });
          parsedAny = true;
        }
      }
    }

    round++;

    // Stop if we got enough turns AND one of them mentions a price change
    if (turns.length >= 7) break;

    // If we parsed fewer than 2 new lines, prompt for continuation
    if (!parsedAny && round > 1) {
      messages.push({ role: 'user', content: 'Continue the conversation. Output CALLER: or OPERATOR: lines only.' });
    } else {
      messages.push({ role: 'user', content: 'Continue the conversation. The CALLER should use leverage and negotiate. The price must change.' });
    }
  }

  return turns;
}

async function main() {
  console.log('🎭 The Negotiator — Two-Agent Demo\n');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log('🤖 Generating dialogue between agents...\n');
  const turns = await generateDialogue(openai);

  console.log(`📝 ${turns.length} dialogue turns generated\n`);
  console.log('━━━ FULL TRANSCRIPT ━━━\n');

  let transcript = '# Two-Agent Demo Transcript\n\n';
  transcript += '**Scenario:** Moving Rock Hill, SC → Charlotte, NC. 2-bedroom, stairs, Aug 1st.\n\n';
  transcript += '| # | Speaker | Text |\n|---|---|---|\n';

  turns.forEach((turn, i) => {
    const emoji = turn.speaker === 'CALLER' ? '📞' : '🏢';
    console.log(`${emoji} ${turn.speaker}: ${turn.text}`);
    transcript += `| ${i + 1} | ${turn.speaker} | ${turn.text.replace(/\n/g, ' ')} |\n`;
  });

  writeFileSync('two-agent-transcript.md', transcript);
  console.log('\n📄 Transcript saved to two-agent-transcript.md');

  // Generate audio
  console.log('\n🔊 Generating audio files...');
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const speaker = turn.speaker === 'CALLER' ? 'caller' : 'operator';
    process.stdout.write(`  Turn ${i + 1}/${turns.length}: ${speaker}... `);
    const file = await speak(turn.text, turn.voiceId, i + 1, speaker);
    console.log(file || '✓ (text only)');
  }

  console.log('\n✅ Demo ready! Open two-agent-transcript.md to see the full conversation.');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
