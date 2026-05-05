import type {
  AnalysisResponse,
  PortfolioAdvice,
  RecommendationResponse,
  WatchlistSummary,
} from "../types";

export function strategyTone(
  tone: AnalysisResponse["strategy"]["tone"],
): "positive" | "negative" | "neutral" {
  if (tone === "entry") return "positive";
  if (tone === "risk") return "negative";
  return "neutral";
}

export function alertLevelGlowTone(
  level: AnalysisResponse["alerts"][number]["level"],
): "success" | "danger" | "warn" {
  if (level === "entry") return "success";
  if (level === "risk") return "danger";
  return "warn";
}

export function alertLevelLabel(
  level: AnalysisResponse["alerts"][number]["level"],
): string {
  if (level === "entry") return "建仓";
  if (level === "risk") return "风险";
  return "观察";
}

export type TeamStatus = AnalysisResponse["marketContext"]["teamSignal"]["status"];

export function teamStatusTone(status: TeamStatus): "positive" | "negative" | "neutral" {
  if (status === "building") return "positive";
  if (status === "exiting") return "negative";
  return "neutral";
}

export function teamStatusLabel(status: TeamStatus): string {
  if (status === "building") return "偏建仓";
  if (status === "exiting") return "偏撤退";
  return "中性";
}

export function llmDecisionLabel(decision: AnalysisResponse["llm"]["alertDecision"]): string {
  if (decision === "push_alert") return "推送预警";
  if (decision === "watch_closely") return "重点盯盘";
  if (decision === "observe_only") return "保持观察";
  return "AI 暂不可用";
}

export function llmRegimeLabel(regime: AnalysisResponse["llm"]["regime"]): string {
  if (regime === "accumulation") return "偏建仓";
  if (regime === "distribution") return "偏派发";
  if (regime === "breakout_watch") return "突破观察";
  if (regime === "panic") return "恐慌阶段";
  return "中性震荡";
}

export function earlyAccumulationLabel(
  state: AnalysisResponse["earlyAccumulation"]["state"],
): string {
  if (state === "early_build") return "提前建仓";
  if (state === "crowded_breakout") return "已被市场看见";
  if (state === "watch") return "继续观察";
  return "暂未触发";
}

export function badgeTone(score: number): "high" | "mid" | "low" {
  if (score >= 75) return "high";
  if (score >= 58) return "mid";
  return "low";
}

export function pushSignalLabel(level: WatchlistSummary["alertSignal"]["level"]): string {
  if (level === "push_entry") return "AI 建仓推送";
  if (level === "push_risk") return "AI 风险推送";
  if (level === "watch") return "重点观察";
  return "暂无信号";
}

export function pushSignalTone(
  level: WatchlistSummary["alertSignal"]["level"],
): "positive" | "negative" | "warning" | "neutral" {
  if (level === "push_entry") return "positive";
  if (level === "push_risk") return "negative";
  if (level === "watch") return "warning";
  return "neutral";
}

export function shouldShowMarketHashAlias(
  name: string,
  marketHashName?: string | null,
): boolean {
  return Boolean(marketHashName?.trim() && marketHashName.trim() !== name.trim());
}

export function recommendationTypeLabel(
  type: RecommendationResponse["positive"][number]["recommendationType"],
): string {
  if (type === "early_build") return "提前建仓";
  if (type === "bottom_reversal") return "底部反转";
  if (type === "rotation") return "题材轮动";
  if (type === "risk_avoid") return "风险回避";
  return "趋势跟随";
}

export type AlertType = "entry" | "dump" | "watch";

export function alertTypeLabel(type: AlertType): string {
  if (type === "entry") return "建仓推送";
  if (type === "dump") return "跑路预警";
  return "重点观察";
}

export function alertTypeGlowTone(type: AlertType): "success" | "danger" | "warn" {
  if (type === "entry") return "success";
  if (type === "dump") return "danger";
  return "warn";
}

export type HolderRole = "builder" | "exiting" | "watch";

export function holderRoleTone(role: HolderRole): "positive" | "negative" | "neutral" {
  if (role === "builder") return "positive";
  if (role === "exiting") return "negative";
  return "neutral";
}

export function holderRoleLabel(role: HolderRole): string {
  if (role === "builder") return "加仓中";
  if (role === "exiting") return "减仓中";
  return "观察";
}


export type PortfolioActionTone = "positive" | "negative" | "neutral";

export function portfolioActionLabel(action: PortfolioAdvice["action"]): string {
  if (action === "add") return "继续加仓";
  if (action === "reduce") return "减仓观察";
  if (action === "exit") return "优先卖出";
  return "继续持有";
}

export function portfolioActionTone(action: PortfolioAdvice["action"]): PortfolioActionTone {
  if (action === "add") return "positive";
  if (action === "reduce" || action === "exit") return "negative";
  return "neutral";
}

export type GlowToneFromAction = "success" | "warn" | "danger" | "neutral";

export function portfolioActionGlowTone(action: PortfolioAdvice["action"]): GlowToneFromAction {
  if (action === "add") return "success";
  if (action === "reduce") return "warn";
  if (action === "exit") return "danger";
  return "neutral";
}
