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

/* Per-item loaders. Keyed on the identifier so switching company or scheme
   re-runs the fetch, and the module-level cache makes a revisit instant. */
import { loadStock, loadFund, loadSectors, loadHoldings,
  type StockDetail, type FundDetail, type Sectors, type SchemeHoldings } from "./data";
import { useCallback } from "react";

export function useStock(symbol: string) {
  return useAsync<StockDetail>(useCallback(() => loadStock(symbol), [symbol]));
}
export function useFund(code: string) {
  return useAsync<FundDetail>(useCallback(() => loadFund(code), [code]));
}
export const useSectors = () => useAsync<Sectors>(loadSectors);

export function useHoldings(code: string) {
  return useAsync<SchemeHoldings | null>(useCallback(() => loadHoldings(code), [code]));
}
