import { NavLink, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/screener", label: "Screener" },
  { to: "/patterns", label: "Patterns" },
  { to: "/funds", label: "Funds" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() =>
    (typeof document !== "undefined" && document.documentElement.dataset.theme) || "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("myfin.theme", theme);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title="Toggle light / dark"
      className="grid h-8 w-8 place-items-center border border-line-2 text-ink-dim transition-colors hover:border-ink hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -35 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 35 }}
          transition={{ duration: 0.18 }}
          className="text-[13px] leading-none"
        >
          {theme === "dark" ? "☾" : "☀"}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export default function Shell({ children, asOf }: { children: ReactNode; asOf?: string }) {
  return (
    <div className="grain min-h-full">
      <header className="sticky top-0 z-50 border-b border-line bg-paper/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-7 gap-y-2 px-5 py-3 sm:px-8">
          <Link to="/" className="shrink-0 font-serif text-[19px] italic tracking-tight">
            my<b className="font-sans not-italic font-extrabold tracking-[-0.04em]">financial</b>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="relative px-2.5 py-1.5">
                {({ isActive }) => (
                  <>
                    <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors
                      ${isActive ? "text-ink" : "text-ink-faint hover:text-ink-dim"}`}>
                      {n.label}
                    </span>
                    {isActive && (
                      // one shared element slides between tabs, so the nav reads
                      // as a single object rather than four independent ones
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute inset-x-1.5 -bottom-[13px] h-px bg-ink"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          {asOf && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{asOf}</span>
            </div>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1560px] px-5 pb-24 sm:px-8">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1560px] px-5 py-7 text-[11.5px] leading-relaxed text-ink-faint sm:px-8">
          Educational research only — not investment advice under SEBI (Investment Advisers) Regulations, 2013.
          Prices, volumes and delivery percentages are official NSE bhavcopy data; mutual fund NAVs are official AMFI data.
          Every return, ratio and risk figure is computed from that published data. Past performance does not indicate future results.
        </div>
      </footer>
    </div>
  );
}
