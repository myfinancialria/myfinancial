import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, lazy } from "react";
import Shell from "./components/Shell";
import Overview from "./routes/Overview";
import { useStocks } from "./lib/useData";
import { pageMotion } from "./components/motion";
import { Skeleton } from "./components/ui";
import { relativeDay } from "./lib/format";

// Split by route: the screener and pattern browser carry real weight, and the
// overview should not wait on either of them.
const Screener = lazy(() => import("./routes/Screener"));
const Patterns = lazy(() => import("./routes/Patterns"));
const Funds = lazy(() => import("./routes/Funds"));
const Company = lazy(() => import("./routes/Company"));
const Stocks = lazy(() => import("./routes/Stocks"));
const Insights = lazy(() => import("./routes/Insights"));
const Fund = lazy(() => import("./routes/Fund"));
const Advisory = lazy(() => import("./routes/Advisory"));
// Planning and Estate pull in the shared tax/goals/estate engines, so they are
// split hardest: someone screening stocks should never download the Monte Carlo.
const Planning = lazy(() => import("./routes/Planning"));
const Estate = lazy(() => import("./routes/Estate"));
// NRI carries its own knowledge corpus and four calculators, so it is split
// too — nobody screening stocks should download the treaty tables.
const NRI = lazy(() => import("./routes/NRI"));

const Fallback = () => (
  <div className="space-y-4 pt-10">
    <Skeleton className="h-10 w-64" />
    <Skeleton className="h-[420px] w-full" />
  </div>
);

export default function App() {
  const location = useLocation();
  const stocks = useStocks();
  const asOf = stocks.data?.priceDate ? `NSE close ${stocks.data.priceDate} · ${relativeDay(stocks.data.priceDate)}` : undefined;

  return (
    <Shell asOf={asOf}>
      <AnimatePresence mode="wait">
        <motion.div key={location.pathname} {...pageMotion}>
          <Suspense fallback={<Fallback />}>
            <Routes location={location}>
              <Route path="/" element={<Overview />} />
              <Route path="/screener" element={<Screener />} />
              <Route path="/patterns" element={<Patterns />} />
              <Route path="/funds" element={<Funds />} />
              <Route path="/fund/:code" element={<Fund />} />
              <Route path="/stocks" element={<Stocks />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/company/:symbol" element={<Company />} />
              <Route path="/advisory" element={<Advisory />} />
              <Route path="/planning" element={<Planning />} />
              <Route path="/estate" element={<Estate />} />
              <Route path="/nri" element={<NRI />} />
              <Route path="*" element={<Overview />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}
