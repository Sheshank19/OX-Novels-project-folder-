import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readDevVars, writeDevVars } from './dev-vars.mjs';

const rl = readline.createInterface({ input, output });
try {
  console.log('\nOX Novels - FREE Gemini Story Checker setup\n');
  console.log('Create a Gemini API key in Google AI Studio. Do not enable paid billing for this OX setup.');
  console.log('OX uses Gemini 2.5 Flash / Flash-Lite with Google Search grounding only when you press Check.');
  const key = (await rl.question('\nGemini API key: ')).trim();
  if (!key) throw new Error('No Gemini API key entered.');
  const choice = (await rl.question('Model [gemini-2.5-flash]: ')).trim() || 'gemini-2.5-flash';
  const allowed = new Set(['gemini-2.5-flash','gemini-2.5-flash-lite']);
  if (!allowed.has(choice)) throw new Error('For the free-only OX setup use gemini-2.5-flash or gemini-2.5-flash-lite.');
  const vars = readDevVars();
  vars.delete('OPENAI_API_KEY');
  vars.delete('STORY_CHECKER_MODEL');
  vars.set('GEMINI_API_KEY', key);
  vars.set('GEMINI_STORY_CHECKER_MODEL', choice);
  writeDevVars(vars);
  console.log('\nGemini checker saved to .dev.vars. Restart OX Novels, then use Admin > Story Checks.');
  console.log('If the API is unavailable/quota-limited, the Admin also has a completely manual Gemini copy/paste fallback.');
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
