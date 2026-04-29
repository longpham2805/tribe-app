import type { MondayNotStartedItem } from "../../../types";
import { ArrowRightIcon, RefreshIcon, SearchIcon } from "./MondayImportIcons";
import { MondayImportHeader } from "./MondayImportHeader";
import { MondayItemGroups } from "./MondayItemGroups";

export function MondayBrowseStep({
  loadingItems,
  error,
  items,
  filteredItems,
  groupedItems,
  focusedIndex,
  selectedItem,
  search,
  boardLabel,
  syncedAt,
  syncLabel,
  onSearchChange,
  onFocusIndexChange,
  onSelectItem,
  onLoad,
  onClose,
  onContinue,
}: {
  loadingItems: boolean;
  error: string | null;
  items: MondayNotStartedItem[];
  filteredItems: MondayNotStartedItem[];
  groupedItems: [string, MondayNotStartedItem[]][];
  focusedIndex: number;
  selectedItem: MondayNotStartedItem | null;
  search: string;
  boardLabel: string;
  syncedAt: Date | null;
  syncLabel: string | null;
  onSearchChange: (value: string) => void;
  onFocusIndexChange: (index: number) => void;
  onSelectItem: (item: MondayNotStartedItem | null) => void;
  onLoad: () => void;
  onClose: () => void;
  onContinue: (item: MondayNotStartedItem) => void;
}) {
  const hasBrowseRows = !loadingItems && filteredItems.length > 0;

  return (
    <div className={`monday-import monday-import--browse${hasBrowseRows ? " monday-import--browse-listing" : ""}`}>
      <MondayImportHeader step="browse" onClose={onClose} />

      <div className="monday-import__browse-top">
        <div className="monday-import__toolbar">
          <select className="monday-import__board-select" value={boardLabel} onChange={() => undefined} aria-label="Monday board">
            <option value={boardLabel}>{boardLabel}</option>
          </select>

          <div className="monday-import__search">
            <SearchIcon />
            <input
              className="input monday-import__search-input"
              placeholder="Search by ID, title, or label..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              autoFocus
            />
          </div>

          <button type="button" className="monday-import__refresh-button" disabled={loadingItems} onClick={onLoad}>
            <RefreshIcon />
            {loadingItems ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {!loadingItems && !error && syncedAt && (
          <div className="monday-import__connection">
            <span className="monday-import__connection-dot" />
            <span>Connected</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{boardLabel}</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{items.length} tickets</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{syncLabel}</span>
          </div>
        )}

        {error && <div className="error monday-import__error">{error}</div>}
      </div>

      <div className="monday-import__browse-list">
        {loadingItems ? (
          <div className="empty">Loading Monday items…</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty">{items.length === 0 ? "No not-started Monday items found." : "No items match your search."}</div>
        ) : (
          <MondayItemGroups
            groupedItems={groupedItems}
            filteredItems={filteredItems}
            focusedIndex={focusedIndex}
            selectedItem={selectedItem}
            onFocusIndexChange={onFocusIndexChange}
            onSelectItem={onSelectItem}
            onContinue={onContinue}
          />
        )}
      </div>

      <footer className="monday-import__footer monday-import__footer--browse">
        <div className="monday-import__selection">
          {selectedItem ? (
            <>
              <span className="monday-import__item-id">MON-{selectedItem.id}</span>
              <span>selected ·</span>
              <kbd>↵</kbd>
              <span>to continue</span>
            </>
          ) : (
            <span>Select a ticket to import</span>
          )}
        </div>

        <div className="monday-import__footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary monday-import__continue-button"
            onClick={() => {
              if (selectedItem) onContinue(selectedItem);
            }}
            disabled={!selectedItem}
          >
            <ArrowRightIcon />
            Continue
          </button>
        </div>
      </footer>
    </div>
  );
}
