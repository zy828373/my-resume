import { motion } from "framer-motion";
import { MagneticButton } from "../primitives/MagneticButton";

export type PageKey = "market" | "watchlist" | "holders" | "recommendations" | "portfolio" | "health";

export interface PageTab {
  key: PageKey;
  label: string;
  hint: string;
  count: number | null;
}

export interface PageNavProps {
  tabs: PageTab[];
  active: PageKey;
  onChange: (key: PageKey) => void;
}

export function PageNav({ tabs, active, onChange }: PageNavProps) {
  return (
    <nav className="page-nav" aria-label="页面导航">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <MagneticButton
            key={tab.key}
            className={`page-tab ${isActive ? "active" : ""}`.trim()}
            type="button"
            strength={0.18}
            onClick={() => onChange(tab.key)}
            aria-current={isActive ? "page" : undefined}
          >
            <strong>{tab.label}</strong>
            <span>{tab.hint}</span>
            <em>{tab.count == null ? "--" : tab.count}</em>
            {isActive ? (
              <motion.span
                layoutId="page-tab-indicator"
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "0 0 auto 0",
                  height: 2,
                  background:
                    "linear-gradient(90deg, transparent, rgba(96, 229, 210, 0.9), transparent)",
                }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              />
            ) : null}
          </MagneticButton>
        );
      })}
    </nav>
  );
}
