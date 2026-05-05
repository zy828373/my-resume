import type { ConfigResponse, RefreshRuntimeStatus } from "../../types";
import { MagneticButton } from "../primitives/MagneticButton";
import { StatusPill, type StatusDotState, type StatusPillTone } from "./StatusPill";

export interface TopBarProps {
  config: ConfigResponse | null;
  refreshStatus: RefreshRuntimeStatus | null;
  refreshStatusText: string;
  refreshStatusTone: StatusPillTone;
  onOpenSettings: () => void;
  onRefresh: () => void;
}

function dotForConfig(config: ConfigResponse | null): StatusDotState {
  return config?.configured ? "online" : "offline";
}

function dotForRefresh(status: RefreshRuntimeStatus | null): StatusDotState {
  if (status?.running) return "online";
  if (status?.enabled) return "idle";
  return "offline";
}

export function TopBar({
  config,
  refreshStatus,
  refreshStatusText,
  refreshStatusTone,
  onOpenSettings,
  onRefresh,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">CS</div>
        <div>
          <h1>CS2 饰品交易监控台</h1>
          <p>
            基于 CSQAQ 聚合的 BUFF / 悠悠有品行情，聚焦建仓预判与跑路预警
          </p>
        </div>
      </div>

      <div className="topbar-actions">
        <StatusPill dot={dotForConfig(config)}>
          {config?.configured
            ? `Token 已配置 ${config.maskedToken ?? ""}`
            : "等待配置 ApiToken"}
        </StatusPill>
        <StatusPill dot={dotForRefresh(refreshStatus)} tone={refreshStatusTone} wide>
          {refreshStatusText}
        </StatusPill>
        <MagneticButton className="ghost-button" type="button" onClick={onOpenSettings}>
          数据源设置
        </MagneticButton>
        <MagneticButton className="primary-button" type="button" onClick={onRefresh}>
          刷新监控
        </MagneticButton>
      </div>
    </header>
  );
}
