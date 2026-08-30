import { useCallback, useEffect, useState } from 'react';

/* Page-scoped fetching, for data that belongs to one screen rather than to
 * the whole app — a lease's fees, a bill's line items, the backup list.
 *
 * A response for a request that has been superseded is dropped rather than
 * written over newer data: the working month can change while a request is in
 * flight, and the answer to the old question is not an answer to the new one.
 */
export function useApi(fetcher, deps, { skip = false } = {}){
  const [state, setState] = useState({ data: null, loading: !skip, error: null });
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    if(skip){ setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    Promise.resolve(fetcher())
      .then(data => { if(alive) setState({ data, loading: false, error: null }); })
      .catch(error => { if(alive) setState({ data: null, loading: false, error }); });
    return () => { alive = false; };
  // The caller decides what makes this a different question.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, skip]);

  return { ...state, refresh };
}
