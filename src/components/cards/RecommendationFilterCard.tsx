import type { RecommendationResponse } from "../../types";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";

type Board = RecommendationResponse["boards"][number];

export interface RecommendationFilterCardProps {
  boards: Board[];
  boardKey: string;
  segmentKey: string;
  activeBoard: Board | null;
  onBoardChange: (key: string) => void;
  onSegmentChange: (key: string) => void;
}

/**
 * Static filter card (no hover motion). The chip rows inside use
 * StaggerList to fan in when the board/segment set changes.
 */
export function RecommendationFilterCard({
  boards,
  boardKey,
  segmentKey,
  activeBoard,
  onBoardChange,
  onSegmentChange,
}: RecommendationFilterCardProps) {
  return (
    <div className="recommendation-filter-card">
      <div className="stage-filter-group">
        <span className="stage-filter-label">板块过滤</span>
        <StaggerList
          as="div"
          className="chip-row compact"
          key={`boards-${boards.length}`}
        >
          <StaggerItem>
            <button
              className={`filter-chip ${boardKey === "all" ? "active" : ""}`.trim()}
              type="button"
              onClick={() => onBoardChange("all")}
            >
              全部板块
            </button>
          </StaggerItem>
          {boards.map((board) => (
            <StaggerItem key={board.key}>
              <button
                className={`filter-chip ${boardKey === board.key ? "active" : ""}`.trim()}
                type="button"
                onClick={() => onBoardChange(board.key)}
              >
                {board.label}
                <span>{board.count}</span>
              </button>
            </StaggerItem>
          ))}
        </StaggerList>
      </div>

      {activeBoard && activeBoard.segments.length > 0 ? (
        <div className="stage-filter-group">
          <span className="stage-filter-label">细分过滤</span>
          <StaggerList
            as="div"
            className="chip-row compact secondary"
            key={`segments-${activeBoard.key}-${activeBoard.segments.length}`}
          >
            <StaggerItem>
              <button
                className={`filter-chip ${segmentKey === "all" ? "active" : ""}`.trim()}
                type="button"
                onClick={() => onSegmentChange("all")}
              >
                全部细分
              </button>
            </StaggerItem>
            {activeBoard.segments.map((segment) => (
              <StaggerItem key={segment.key}>
                <button
                  className={`filter-chip ${segmentKey === segment.key ? "active" : ""}`.trim()}
                  type="button"
                  onClick={() => onSegmentChange(segment.key)}
                >
                  {segment.label}
                  <span>{segment.count}</span>
                </button>
              </StaggerItem>
            ))}
          </StaggerList>
        </div>
      ) : null}
    </div>
  );
}
