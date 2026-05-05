import type { HolderDrilldownResponse } from "../../types";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { formatDateTime } from "../../utils/format";

type Snapshot = HolderDrilldownResponse["snapshots"][number];

export interface SnapshotCardProps {
  snapshot: Snapshot;
}

export function SnapshotCard({ snapshot }: SnapshotCardProps) {
  return (
    <SpotlightCard
      as="article"
      className="snapshot-card"
      color="var(--spot-accent)"
      radius={200}
    >
      <strong>{formatDateTime(snapshot.createdAt)}</strong>
      <span>快照 ID {snapshot.snapshotId}</span>
    </SpotlightCard>
  );
}
