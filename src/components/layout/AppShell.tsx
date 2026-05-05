import type { ReactNode } from "react";
import type { ConfigResponse, RefreshRuntimeStatus } from "../../types";
import { TopBar } from "./TopBar";
import type { StatusPillTone } from "./StatusPill";
import { PageNav, type PageKey, type PageTab } from "./PageNav";
import { FeedbackBar } from "./FeedbackBar";

export interface AppShellProps {
  config: ConfigResponse | null;
  refreshStatus: RefreshRuntimeStatus | null;
  refreshStatusText: string;
  refreshStatusTone: StatusPillTone;
  onOpenSettings: () => void;
  onRefresh: () => void;
  tabs: PageTab[];
  activePage: PageKey;
  onChangePage: (key: PageKey) => void;
  message?: string | null;
  error?: string | null;
  /** Content rendered between the topbar/feedback-bar and the page body. */
  marketStrip?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  config,
  refreshStatus,
  refreshStatusText,
  refreshStatusTone,
  onOpenSettings,
  onRefresh,
  tabs,
  activePage,
  onChangePage,
  message,
  error,
  marketStrip,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar
        config={config}
        refreshStatus={refreshStatus}
        refreshStatusText={refreshStatusText}
        refreshStatusTone={refreshStatusTone}
        onOpenSettings={onOpenSettings}
        onRefresh={onRefresh}
      />
      <PageNav tabs={tabs} active={activePage} onChange={onChangePage} />
      {marketStrip}
      <FeedbackBar message={message} error={error} />
      {children}
    </div>
  );
}
