import type {
  AnalysisResponse,
  ConfigResponse,
  HistoryPlaybackResponse,
  HolderDrilldownResponse,
  SearchSuggestion,
  WatchlistSummary,
} from "../../types";
import { WatchlistAnalysis } from "./WatchlistAnalysis";
import { WatchlistRightRail } from "./WatchlistRightRail";
import { WatchlistSidebar } from "./WatchlistSidebar";
import type { LiveAlert } from "./MarketPage";

type Holder = AnalysisResponse["holderInsights"][number];

export interface WatchlistPageProps {
  config: ConfigResponse | null;
  analysis: AnalysisResponse | null;
  historyPlayback: HistoryPlaybackResponse | null;
  holderDetail: HolderDrilldownResponse | null;

  searchText: string;
  onSearchTextChange: (value: string) => void;
  searchResults: SearchSuggestion[];
  onAddWatch: (item: SearchSuggestion) => void;

  watchlist: WatchlistSummary[];
  filteredWatchlist: WatchlistSummary[];
  selectedId: string | null;
  pendingGoodId?: string | null;
  onSelectItem: (goodId: string) => void;
  onRemoveWatch: (goodId: string) => void;

  liveAlerts: LiveAlert[];
  onOpenHolderDetail: (holder: Holder) => void;

  loading: boolean;
  isSwitchPending: boolean;
  analysisSyncing: boolean;
}

export function WatchlistPage(props: WatchlistPageProps) {
  return (
    <main className="workspace">
      <WatchlistSidebar
        config={props.config}
        searchText={props.searchText}
        onSearchTextChange={props.onSearchTextChange}
        searchResults={props.searchResults}
        onAddWatch={props.onAddWatch}
        watchlist={props.watchlist}
        filteredWatchlist={props.filteredWatchlist}
        selectedId={props.selectedId}
        pendingGoodId={props.pendingGoodId}
        onSelectItem={props.onSelectItem}
        onRemoveWatch={props.onRemoveWatch}
        liveAlerts={props.liveAlerts}
      />
      <WatchlistAnalysis
        analysis={props.analysis}
        historyPlayback={props.historyPlayback}
        holderDetail={props.holderDetail}
        onOpenHolderDetail={props.onOpenHolderDetail}
        loading={props.loading}
        isSwitchPending={props.isSwitchPending}
        analysisSyncing={props.analysisSyncing}
      />
      <WatchlistRightRail analysis={props.analysis} />
    </main>
  );
}
