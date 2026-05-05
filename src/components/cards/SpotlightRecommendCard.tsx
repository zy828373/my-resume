import type { RecommendationResponse } from "../../types";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { ShineBorder } from "../primitives/ShineBorder";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { TiltedCard } from "../primitives/TiltedCard";
import { formatPercent } from "../../utils/format";
import {
  recommendationTypeLabel,
  shouldShowMarketHashAlias,
} from "../../utils/tone";

type RecommendationCard = RecommendationResponse["positive"][number];

const POOL_LABELS = {
  candidate_core: "核心候选",
  candidate_low_weight: "低权重",
  watchlist: "观察池",
  risk_only: "仅风险",
  excluded: "已剔除",
} as const;

export interface SpotlightRecommendCardProps {
  card: RecommendationCard;
  rank: number;
  onOpen: (goodId: string) => void;
}

/**
 * The "focused" recommendation card. This is the ONLY non-hero surface
 * that gets the Tilt treatment — at most 2-3 on screen at once, so the
 * performance budget can absorb it. Layers from bottom to top:
 *   ShineBorder (accent tone) → TiltedCard → SpotlightCard.
 */
export function SpotlightRecommendCard({
  card,
  rank,
  onOpen,
}: SpotlightRecommendCardProps) {
  const isAccent = card.recommendationType === "bottom_reversal";
  const spotColor = isAccent ? "var(--spot-warn)" : "var(--spot-accent)";
  const pillTone = isAccent ? "positive" : "warning";
  const poolReasons = [
    ...card.autonomousPool.keepReasons,
    ...card.autonomousPool.downgradeReasons,
    ...card.autonomousPool.excludeReasons,
    ...card.autonomousPool.riskTags,
  ].slice(0, 4);
  const displayTags = [...card.hypeTags, ...poolReasons].slice(0, 5);

  return (
    <ShineBorder tone={isAccent ? "warn" : "accent"}>
      <TiltedCard maxTilt={5}>
        <SpotlightCard
          as="button"
          type="button"
          className={`spotlight-card ${isAccent ? "accent" : ""}`.trim()}
          color={spotColor}
          onClick={() => onOpen(card.goodId)}
        >
          <div className="spotlight-card-top">
            <span className="spotlight-rank">#{rank}</span>
            <SignalPill tone={pillTone}>
              {recommendationTypeLabel(card.recommendationType)}
            </SignalPill>
            <SignalPill tone={card.autonomousPool.pool === "risk_only" ? "negative" : "positive"}>
              {POOL_LABELS[card.autonomousPool.pool]}
            </SignalPill>
          </div>
          <div>
            <strong>{card.name}</strong>
            {shouldShowMarketHashAlias(card.name, card.marketHashName) ? (
              <small className="item-market-hash">{card.marketHashName}</small>
            ) : null}
          </div>
          <p>{card.reason}</p>
          <div className="spotlight-card-metrics">
            <span>
              综合 <AnimatedNumber value={card.score} />
            </span>
            <span>
              准入 <AnimatedNumber value={card.autonomousPool.admissionScore} />
            </span>
            <span>供给 {card.autonomousPool.supplyGrade}</span>
            <span>
              建仓 <AnimatedNumber value={card.entryScore} />
            </span>
            <span>
              题材 <AnimatedNumber value={card.hypeFitScore} />
            </span>
            <span>7天 {formatPercent(card.expected7dPct, 1)}</span>
          </div>
          {displayTags.length ? (
            <div className="chip-row compact">
              {displayTags.map((tag) => (
                <span className="muted-tag" key={`${card.goodId}-${tag}`}>
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="spotlight-card-footer">
            <span>{card.taxonomy.categoryLabel}</span>
            <span>{card.taxonomy.segmentLabel}</span>
          </div>
        </SpotlightCard>
      </TiltedCard>
    </ShineBorder>
  );
}
