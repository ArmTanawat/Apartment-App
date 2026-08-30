import { useState } from 'react';
import { messageOf } from './api.js';

/* What a dialog does with a write.
 *
 * The message the API returned is what gets shown — the backend writes them
 * for a person to read, and inventing wording here would say less. A refused
 * action is not a failure state: the reason goes where the button is, and the
 * dialog stays open so the alternative it describes can be taken.
 *
 * Nothing is retried. Repeating a POST after a timeout can produce two of
 * something, and the user is the one who should decide to try again.
 */
export function useSubmit(){
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // `validate` returns a message to show instead of writing anything, for the
  // checks the server never sees — a blank name, a number that is not one.
  const run = async (fn, validate) => {
    const complaint = validate ? validate() : null;
    if(complaint){ setError(complaint); return false; }
    setBusy(true); setError(null);
    try { await fn(); return true; }
    catch (e) { setError(messageOf(e)); return false; }
    finally { setBusy(false); }
  };

  return { error, busy, run, setError };
}
