import type { MondayNotStartedItem } from "../../../types";
import { PriorityChip, TagChip } from "./MondayImportChips";
import { getItemMeta } from "./mondayImportUtils";

export function MondayItemGroups({
  groupedItems,
  filteredItems,
  focusedIndex,
  selectedItem,
  onFocusIndexChange,
  onSelectItem,
  onContinue,
}: {
  groupedItems: [string, MondayNotStartedItem[]][];
  filteredItems: MondayNotStartedItem[];
  focusedIndex: number;
  selectedItem: MondayNotStartedItem | null;
  onFocusIndexChange: (index: number) => void;
  onSelectItem: (item: MondayNotStartedItem | null) => void;
  onContinue: (item: MondayNotStartedItem) => void;
}) {
  return (
    <div className="monday-import__groups">
      {groupedItems.map(([groupTitle, groupItems]) => (
        <section className="monday-import__group" key={groupTitle}>
          <div className="monday-import__group-heading">
            <span>{groupTitle}</span>
            <span>{groupItems.length}</span>
          </div>

          <div className="monday-import__items">
            {groupItems.map((item) => {
              const flatIndex = filteredItems.indexOf(item);
              const isFocused = flatIndex === focusedIndex;
              const isSelected = selectedItem?.id === item.id;
              const { people, priority, tags, updatedAt } = getItemMeta(item);
              const hasMeta = Boolean(priority || tags.length || people || updatedAt);

              return (
                <div
                  key={item.id}
                  className={`monday-import__item${isFocused ? " monday-import__item--focused" : ""}${isSelected ? " monday-import__item--selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onFocusIndexChange(flatIndex);
                    onSelectItem(isSelected ? null : item);
                  }}
                  onDoubleClick={() => onContinue(item)}
                  onMouseEnter={() => onFocusIndexChange(flatIndex)}
                >
                  <span className="monday-import__radio" aria-hidden="true" />
                  <div className="monday-import__item-main">
                    <div className={`monday-import__item-title${hasMeta ? "" : " monday-import__item-title--solo"}`}>
                      <span className="monday-import__item-id">MON-{item.id}</span>
                      <span>{item.name}</span>
                    </div>

                    {hasMeta && (
                      <div className="monday-import__item-meta">
                        {priority && <PriorityChip label={priority} />}
                        {tags.map((tag) => <TagChip key={tag} text={tag} />)}
                        {(people || updatedAt) && (priority || tags.length > 0) && <span className="monday-import__muted-dot">·</span>}
                        {people && <span>{people}</span>}
                        {people && updatedAt && <span className="monday-import__muted-dot">·</span>}
                        {updatedAt && <span>{updatedAt}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
