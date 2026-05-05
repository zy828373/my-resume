import type { PortfolioAdvice } from "../../types";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { GlowCard } from "../primitives/GlowCard";
import { ShineBorder } from "../primitives/ShineBorder";
import { SignalPill } from "../primitives/SignalPill";
import { formatMoney } from "../../utils/format";
import {
  portfolioActionGlowTone,
  portfolioActionLabel,
  portfolioActionTone,
} from "../../utils/tone";

export interface PortfolioAdviceCardProps {
  advice: PortfolioAdvice;
}

export function PortfolioAdviceCard({ advice }: PortfolioAdviceCardProps) {
  const glowTone = portfolioActionGlowTone(advice.action);
  const pillTone = portfolioActionTone(advice.action);
  const isExit = advice.action === "exit";

  const inner = (
    <GlowCard
      tone={glowTone === "neutral" ? "neutral" : glowTone === "success" ? "success" : glowTone === "warn" ? "warn" : "danger"}
      strength={isExit ? "normal" : "subtle"}
      className="portfolio-advice-card"
      as="article"
    >
      <div className="holder-insight-head">
        <strong>{advice.name}</strong>
        <SignalPill tone={pillTone}>{portfolioActionLabel(advice.action)}</SignalPill>
      </div>
      <div className="delta-row">
        <span>成本 {formatMoney(advice.averageCost)}</span>
        <span>现价 {formatMoney(advice.currentPrice)}</span>
        <span>盈亏 {formatMoney(advice.unrealizedPnL)}</span>
      </div>
      <div className="holder-summary-grid portfolio-score-grid">
        <div className="holder-summary-card">
          <span>加仓分</span>
          <strong>
            <AnimatedNumber value={advice.addScore} />
          </strong>
        </div>
        <div className="holder-summary-card">
          <span>持有分</span>
          <strong>
            <AnimatedNumber value={advice.holdScore} />
          </strong>
        </div>
        <div className="holder-summary-card">
          <span>卖出分</span>
          <strong>
            <AnimatedNumber value={advice.sellScore} />
          </strong>
        </div>
      </div>
      <p className="holder-insight-note">{advice.summary}</p>
    </GlowCard>
  );

  return isExit ? <ShineBorder tone="danger">{inner}</ShineBorder> : inner;
}
