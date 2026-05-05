import type { RecommendationResponse } from "../../types";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import {
  pushSignalLabel,
  recommendationTypeLabel,
  shouldShowMarketHashAlias,
} from "../../utils/tone";

type RecommendationCard = RecommendationResponse["positive"][number];

export type MiniRecommendVariant = "watch" | "risk";

const POOL_LABELS = {
  candidate_core: "核心",
  candidate_low_weight: "低权重",
  watchlist: "观察",
  risk_only: "风险",
  excluded: "剔除",
} as const;

export interface MiniRecommendCardProps {
  card: RecommendationCard;
  variant: MiniRecommendVariant;
  onOpen: (goodId: string) => void;
}

export function MiniRecommendCard({
  card,
  variant,
  onOpen,
}: MiniRecommendCardProps) {
  const isRisk = variant === "risk";
  const spotColor = isRisk ? "var(--spot-danger)" : "var(--spot-warn)";
  const pillTone = isRisk ? "negative" : "warning";
  const poolReasons = [
    ...card.autonomousPool.keepReasons,
    ...card.autonomousPool.downgradeReasons,
    ...card.autonomousPool.excludeReasons,
    ...card.autonomousPool.riskTags,
  ].slice(0, 3);

  return (
    <SpotlightCard
      as="button"
      type="button"
      className={`mini-recommend-card ${isRisk ? "risk" : ""}`.trim()}
      color={spotColor}
      onClick={() => onOpen(card.goodId)}
    >
      <div className="recommend-meta">
        <SignalPill tone={pillTone}>
          {recommendationTypeLabel(card.recommendationType)}
        </SignalPill>
        <SignalPill tone={card.autonomousPool.pool === "risk_only" ? "negative" : "warning"}>
          {POOL_LABELS[card.autonomousPool.pool]}
        </SignalPill>
        <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
      </div>
      <div>
        <strong>{card.name}</strong>
        {shouldShowMarketHashAlias(card.name, card.marketHashName) ? (
          <small className="item-market-hash">{card.marketHashName}</small>
        ) : null}
      </div>
      <div className="delta-row">
        {isRisk ? (
          <>
            <span>
              风险 <AnimatedNumber value={card.dumpRiskScore} />
            </span>
            <span>
              准入 <AnimatedNumber value={card.autonomousPool.admissionScore} />
            </span>
            <span>供给 {card.autonomousPool.supplyGrade}</span>
            <span>警报 {pushSignalLabel(card.alertLevel)}</span>
          </>
        ) : (
          <>
            <span>
              评分 <AnimatedNumber value={card.score} />
            </span>
            <span>
              准入 <AnimatedNumber value={card.autonomousPool.admissionScore} />
            </span>
            <span>供给 {card.autonomousPool.supplyGrade}</span>
            <span>
              题材 <AnimatedNumber value={card.hypeFitScore} />
            </span>
            <span>
              建仓 <AnimatedNumber value={card.entryScore} />
            </span>
            <span>
              风险 <AnimatedNumber value={card.dumpRiskScore} />
            </span>
          </>
        )}
      </div>
      {poolReasons.length ? (
        <div className="chip-row compact secondary">
          {poolReasons.map((reason) => (
            <span className="muted-tag" key={`${card.goodId}-${reason}`}>
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </SpotlightCard>
  );
}
