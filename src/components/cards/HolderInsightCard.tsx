import type { RecommendationResponse } from "../../types";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import {
  recommendationTypeLabel,
  shouldShowMarketHashAlias,
} from "../../utils/tone";

type RecommendationCard = RecommendationResponse["positive"][number];

export interface HolderInsightCardProps {
  card: RecommendationCard;
  onOpen: (goodId: string) => void;
}

export function HolderInsightCard({ card, onOpen }: HolderInsightCardProps) {
  const isRisk = card.recommendationType === "risk_avoid";
  const tone = isRisk ? "negative" : "positive";
  const spotColor = isRisk ? "var(--spot-danger)" : "var(--spot-accent)";

  return (
    <SpotlightCard
      as="button"
      className={`holder-insight-card ${tone}`}
      type="button"
      color={spotColor}
      onClick={() => onOpen(card.goodId)}
    >
      <div className="holder-insight-head">
        <div>
          <strong>{card.name}</strong>
          {shouldShowMarketHashAlias(card.name, card.marketHashName) ? (
            <small className="item-market-hash">{card.marketHashName}</small>
          ) : null}
        </div>
        <SignalPill tone={tone}>
          {recommendationTypeLabel(card.recommendationType)}
        </SignalPill>
      </div>
      <div className="delta-row">
        <span>综合 {card.score}</span>
        <span>建仓 {card.entryScore}</span>
        <span>风险 {card.dumpRiskScore}</span>
      </div>
      <p className="holder-insight-note">{card.reason}</p>
    </SpotlightCard>
  );
}
