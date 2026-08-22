import { useEffect, useState } from "react";
import { loadStocks, loadFunds, loadPatterns, type Index, type Patterns } from "./data";

interface State<T> { data: T | null; loading: boolean; error: unknown }

/** One tiny hook over the cached loaders — no state library needed for this. */
function useAsync<T>(loader: () => Promise<T>): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    loader()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
  }, [loader]);
  return state;
}

export const useStocks = () => useAsync<Index>(loadStocks);
export const useFunds = () => useAsync<Index>(loadFunds);
export const usePatterns = () => useAsync<Patterns>(loadPatterns);
