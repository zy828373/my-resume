import type { HolderDrilldownResponse } from "../../types";
import { formatDateTime, formatNumber } from "../../utils/format";

type Activity =
  | HolderDrilldownResponse["focusActivities"][number]
  | HolderDrilldownResponse["latestActivities"][number];

export interface DetailActivityCardProps {
  activity: Activity;
  focused?: boolean;
}

/**
 * Static activity row (Ø tier) — lives inside a modal with dense rows.
 * Motion here would compete with the stagger entry of the list.
 */
export function DetailActivityCard({ activity, focused }: DetailActivityCardProps) {
  return (
    <article className={`detail-activity-card ${focused ? "focused" : ""}`.trim()}>
      <div className="detail-activity-main">
        {activity.iconUrl ? (
          <img
            alt={activity.marketName}
            className="detail-activity-image"
            src={activity.iconUrl}
          />
        ) : (
          <div className="detail-activity-image" />
        )}
        <div>
          <strong>{activity.marketName}</strong>
          <p>
            数量 {formatNumber(activity.count)} · 类型 {activity.type ?? "--"}{" "}
            · {activity.tradable ? "可交易" : "冷却中"}
          </p>
        </div>
      </div>
      <span>{formatDateTime(activity.createdAt)}</span>
    </article>
  );
}
