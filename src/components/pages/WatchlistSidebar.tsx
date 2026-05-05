import type {
  ConfigResponse,
  SearchSuggestion,
  WatchlistSummary,
} from "../../types";
import { EmptyBox } from "../primitives/EmptyBox";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { AlertCard } from "../cards/AlertCard";
import { WatchCard } from "../cards/WatchCard";
import type { LiveAlert } from "./MarketPage";

export interface WatchlistSidebarProps {
  config: ConfigResponse | null;
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
}

export function WatchlistSidebar({
  config,
  searchText,
  onSearchTextChange,
  searchResults,
  onAddWatch,
  watchlist,
  filteredWatchlist,
  selectedId,
  pendingGoodId,
  onSelectItem,
  onRemoveWatch,
  liveAlerts,
}: WatchlistSidebarProps) {
  return (
    <aside className="left-column">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>监控池</h2>
            <p>按饰品名搜索并加入本地监控列表</p>
          </div>
          <span className="muted-tag">
            {filteredWatchlist.length}/{watchlist.length}
          </span>
        </div>

        <label className="search-box">
          <span>搜索</span>
          <input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder={
              config?.configured
                ? "输入饰品名、俗称、武器或磨损"
                : "先配置 ApiToken 再搜索"
            }
            disabled={!config?.configured}
          />
        </label>

        {searchResults.length > 0 ? (
          <div className="search-results">
            {searchResults.map((item) => (
              <button
                className="search-result"
                key={item.id}
                type="button"
                onClick={() => onAddWatch(item)}
              >
                <span>{item.value}</span>
                <small>#{item.id}</small>
              </button>
            ))}
          </div>
        ) : null}

        <StaggerList
          as="div"
          className="watchlist"
          key={`watchlist-${filteredWatchlist.length}`}
        >
          {filteredWatchlist.length === 0 ? (
            <EmptyBox title="还没有监控饰品">
              <p>先配置 Token，然后搜索你想跟踪的饰品加入监控池。</p>
            </EmptyBox>
          ) : null}

          {filteredWatchlist.map((item) => (
            <StaggerItem key={item.goodId}>
              <WatchCard
                item={item}
                active={selectedId === item.goodId}
                pending={pendingGoodId === item.goodId}
                onSelect={onSelectItem}
                onRemove={onRemoveWatch}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      <section className="panel panel-fill">
        <div className="panel-header">
          <div>
            <h2>实时预警</h2>
            <p>按监控池评分自动筛出高优先级信号</p>
          </div>
          <span className="muted-tag">{liveAlerts.length} 条</span>
        </div>

        <StaggerList
          as="div"
          className="alerts-list"
          key={`watchlist-alerts-${liveAlerts.length}`}
        >
          {liveAlerts.length === 0 ? (
            <EmptyBox slim title="当前没有强信号">
              <p>如果刚开始使用，先让系统积累一段历史快照，预警会更稳定。</p>
            </EmptyBox>
          ) : null}

          {liveAlerts.map((alert, index) => (
            <StaggerItem key={`${alert.title}-${index}`}>
              <AlertCard
                type={alert.type}
                title={alert.title}
                detail={alert.detail}
                freshShine={index === 0 && alert.score >= 70}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      </section>
    </aside>
  );
}
