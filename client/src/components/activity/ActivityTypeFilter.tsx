import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityTypeOption } from "../../phaseEvents";

export const ACTIVITY_TYPE_FILTER_STORAGE_KEY = "tribe.activity.hiddenTypes.v1";

const ACTIVITY_TYPE_FILTER_CHANGE_EVENT = "tribe:activity-type-filter-change";

function normalizeHiddenKeys(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function readHiddenKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return normalizeHiddenKeys(JSON.parse(window.localStorage.getItem(ACTIVITY_TYPE_FILTER_STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

function uniqueOptions(options: ActivityTypeOption[]): ActivityTypeOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.key)) return false;
    seen.add(option.key);
    return true;
  });
}

export function useActivityTypeFilter(options: ActivityTypeOption[]) {
  const [hiddenTypeKeys, setHiddenTypeKeys] = useState<Set<string>>(() => readHiddenKeys());
  const activityTypeOptions = useMemo(() => uniqueOptions(options), [options]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACTIVITY_TYPE_FILTER_STORAGE_KEY, JSON.stringify([...hiddenTypeKeys]));
      window.dispatchEvent(new Event(ACTIVITY_TYPE_FILTER_CHANGE_EVENT));
    } catch {
      return;
    }
  }, [hiddenTypeKeys]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncHiddenKeys = () => {
      const nextHiddenKeys = readHiddenKeys();
      setHiddenTypeKeys((currentHiddenKeys) => (
        areSetsEqual(currentHiddenKeys, nextHiddenKeys) ? currentHiddenKeys : nextHiddenKeys
      ));
    };
    window.addEventListener("storage", syncHiddenKeys);
    window.addEventListener(ACTIVITY_TYPE_FILTER_CHANGE_EVENT, syncHiddenKeys);
    return () => {
      window.removeEventListener("storage", syncHiddenKeys);
      window.removeEventListener(ACTIVITY_TYPE_FILTER_CHANGE_EVENT, syncHiddenKeys);
    };
  }, []);

  const isTypeVisible = useCallback(
    (key: string) => !hiddenTypeKeys.has(key),
    [hiddenTypeKeys],
  );

  const toggleType = useCallback((key: string) => {
    setHiddenTypeKeys((currentHiddenKeys) => {
      const nextHiddenKeys = new Set(currentHiddenKeys);
      if (nextHiddenKeys.has(key)) {
        nextHiddenKeys.delete(key);
      } else {
        nextHiddenKeys.add(key);
      }
      return nextHiddenKeys;
    });
  }, []);

  return { activityTypeOptions, hiddenTypeKeys, isTypeVisible, toggleType };
}

interface ActivityTypeFilterProps {
  options: ActivityTypeOption[];
  isTypeVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
}

export function ActivityTypeFilter({ options, isTypeVisible, onToggle }: ActivityTypeFilterProps) {
  if (options.length === 0) return null;

  return (
    <div className="activity-type-filter" aria-label="Activity type filters">
      {options.map((option) => {
        const visible = isTypeVisible(option.key);
        return (
          <button
            key={option.key}
            type="button"
            className={`activity-type-filter__tag${visible ? " activity-type-filter__tag--active" : ""}`}
            aria-pressed={visible}
            onClick={() => onToggle(option.key)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
