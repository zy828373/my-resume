import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HolderDrilldownResponse } from "../../types";
import { EmptyBox } from "../primitives/EmptyBox";
import { MagneticButton } from "../primitives/MagneticButton";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { DetailActivityCard } from "./DetailActivityCard";
import { HolderSummaryCard } from "./HolderSummaryCard";
import { InventoryCard } from "./InventoryCard";
import { SnapshotCard } from "./SnapshotCard";
import { formatDateTime, formatMoney, formatNumber, formatPercent, formatSignedCount } from "../../utils/format";
import { holderRoleLabel } from "../../utils/tone";

export interface HolderDetailModalProps {
  detail: HolderDrilldownResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onLoadPage: (pageIndex: number) => void;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] as const } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 22, stiffness: 220, mass: 0.6 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const },
  },
};

export function HolderDetailModal({
  detail,
  loading,
  error,
  onClose,
  onLoadPage,
}: HolderDetailModalProps) {
  const open = Boolean(detail || loading || error);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="holder-detail-modal"
          className="modal-mask"
          onClick={onClose}
          variants={backdropVariants}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <motion.div
            className="modal-card holder-detail-modal"
            onClick={(event) => event.stopPropagation()}
            variants={cardVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            role="dialog"
            aria-modal
            aria-label="席位详情"
          >
            <div className="panel-header">
              <div>
                <h2>席位详情</h2>
                <p>查看该席位的公开库存、当前标的异动和历史快照。</p>
              </div>
              <button className="mini-text-button" type="button" onClick={onClose}>
                关闭
              </button>
            </div>

            {loading && !detail ? (
              <EmptyBox slim title="正在加载席位详情">
                <p>后端正在补齐该席位的库存、动态和快照。</p>
              </EmptyBox>
            ) : null}

            {error && !detail ? (
              <EmptyBox slim title="席位详情暂时不可用">
                <p>{error}</p>
              </EmptyBox>
            ) : null}

            {detail ? (
              <div className="holder-detail-layout">
                <section className="holder-detail-hero">
                  <div className="holder-detail-identity">
                    {detail.profile.avatar ? (
                      <img
                        alt={detail.profile.steamName}
                        className="holder-avatar"
                        src={detail.profile.avatar}
                      />
                    ) : (
                      <div className="holder-avatar" />
                    )}
                    <div>
                      <strong>{detail.profile.steamName}</strong>
                      <p>
                        SteamID {detail.profile.steamId ?? "--"} · 角色{" "}
                        {holderRoleLabel(detail.holder.role)}
                      </p>
                      <p>{detail.holder.note}</p>
                    </div>
                  </div>

                  <div className="holder-summary-grid">
                    <HolderSummaryCard
                      label="当前持仓"
                      value={detail.holder.currentNum}
                      hint={`占比 ${formatPercent(detail.holder.sharePct, 2)}`}
                    />
                    <HolderSummaryCard
                      label="24h / 7d 变化"
                      display={`${formatSignedCount(detail.holder.change24hAbs)} / ${formatSignedCount(detail.holder.change7dAbs)}`}
                      hint="用于判断建仓、减仓和撤退节奏"
                    />
                    <HolderSummaryCard
                      label="库存概况"
                      display={`${formatNumber(detail.profile.inventoryCount)} 件`}
                      hint={`可露出 ${formatNumber(detail.profile.visibleAssetCount)} 件`}
                    />
                    <HolderSummaryCard
                      label="活跃时间"
                      display={`${detail.profile.activeDays ?? "--"} 天`}
                      hint={`更新时间 ${formatDateTime(detail.profile.updatedAt)}`}
                    />
                  </div>
                </section>

                <div className="holder-detail-grid">
                  <section className="holder-detail-section">
                    <div className="compact-panel-header">
                      <h3>该席位公开库存</h3>
                      <p>同种饰品会自动堆叠数量，分页查看这个席位当前公开库存里的饰品。</p>
                    </div>

                    <StaggerList
                      as="div"
                      className="inventory-grid"
                      key={`inv-page-${detail.inventory.pageIndex}`}
                    >
                      {detail.inventory.items.map((item, index) => (
                        <StaggerItem
                          key={`${item.goodId ?? item.marketName}-${item.categoryName}-${index}`}
                        >
                          <InventoryCard item={item} />
                        </StaggerItem>
                      ))}
                    </StaggerList>

                    <div className="holder-insight-footer">
                      <div className="holder-detail-pagination">
                        <MagneticButton
                          className="ghost-button"
                          type="button"
                          strength={0.18}
                          disabled={loading || detail.inventory.pageIndex <= 1}
                          onClick={() => onLoadPage(detail.inventory.pageIndex - 1)}
                        >
                          上一页
                        </MagneticButton>
                        <span>
                          第 {detail.inventory.pageIndex} 页 · 每页{" "}
                          {detail.inventory.pageSize} 类
                        </span>
                        <MagneticButton
                          className="ghost-button"
                          type="button"
                          strength={0.18}
                          disabled={loading || !detail.inventory.hasMore}
                          onClick={() => onLoadPage(detail.inventory.pageIndex + 1)}
                        >
                          下一页
                        </MagneticButton>
                      </div>
                      {error ? <span>{error}</span> : null}
                    </div>
                  </section>

                  <section className="holder-detail-section">
                    <div className="compact-panel-header">
                      <h3>当前标的相关动态</h3>
                      <p>优先展示和当前饰品相关的库存动作，再补最近公开动态。</p>
                    </div>

                    <div className="detail-card-list">
                      {detail.focusActivities.map((item, index) => (
                        <DetailActivityCard
                          key={`focus-${index}`}
                          activity={item}
                          focused
                        />
                      ))}
                      {detail.focusActivities.length === 0 ? (
                        <EmptyBox slim title="当前标的暂无额外动态">
                          <p>可以结合下方最近动态和快照继续判断。</p>
                        </EmptyBox>
                      ) : null}
                    </div>

                    <div className="compact-panel-header">
                      <h3>最近公开动态</h3>
                      <p>按时间看最近露出的库存动作。</p>
                    </div>
                    <div className="detail-card-list">
                      {detail.latestActivities.map((item, index) => (
                        <DetailActivityCard key={`latest-${index}`} activity={item} />
                      ))}
                    </div>
                  </section>
                </div>

                <section className="holder-detail-section">
                  <div className="compact-panel-header">
                    <h3>快照列表</h3>
                    <p>按时间回看这个席位的库存快照刷新节奏。</p>
                  </div>
                  <StaggerList
                    as="div"
                    className="snapshot-list"
                    key={`snapshots-${detail.snapshots.length}`}
                  >
                    {detail.snapshots.map((snapshot) => (
                      <StaggerItem key={snapshot.snapshotId}>
                        <SnapshotCard snapshot={snapshot} />
                      </StaggerItem>
                    ))}
                  </StaggerList>
                </section>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
