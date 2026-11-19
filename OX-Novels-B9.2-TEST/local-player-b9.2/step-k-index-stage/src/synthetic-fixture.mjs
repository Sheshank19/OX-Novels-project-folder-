/** Fabricated indexes and syntactically shaped t1 identifiers; NOT encrypted Player tokens. */
export const STORY='b92-step-k-fixture';
export const SOURCE='abcdef123456';
export const CURRENT='g_step_k_current_002';
export const PREVIOUS='g_step_k_previous_001';
export const PREVIOUS_GRACE_UNTIL=4102444800000; // Fixture only, far-future, NOT a production retention policy.
export const CURRENT_COUNT=535;
export const PREVIOUS_COUNT=534;
export const syntheticToken=(generation,i)=>{
  if(generation!==CURRENT && generation!==PREVIOUS) throw Error('NON_SYNTHETIC_GENERATION');
  if(!Number.isSafeInteger(i)||i<0||i>= (generation===CURRENT?CURRENT_COUNT:PREVIOUS_COUNT))
    throw Error('NON_SYNTHETIC_INDEX');
  return `t1.synthetic_${generation}_${String(i).padStart(5,'0')}.FAKE_CIPHERTEXT_FOR_INDEX_ONLY`;
};
export const syntheticMissingToken='t1.synthetic_missing_99999.FAKE_CIPHERTEXT_FOR_INDEX_ONLY';
