import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { CourseStatus, ScoreType } from "@/types/domain";

const STORAGE_KEY = "gpa-manager.desktop.preferences.v1";

export type AppPreferences = {
  defaultSemester: string;
  defaultCourseStatus: CourseStatus;
  defaultScoreType: ScoreType;
  importConfirmRequired: boolean;
  backupBeforeImport: boolean;
  autoSelectNextPendingScore: boolean;
};

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  resetPreferences: () => void;
};

function getSuggestedSemester(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 9) {
    return `${year}秋`;
  }
  if (month >= 7) {
    return `${year}夏`;
  }
  return `${year}春`;
}

function getDefaultPreferences(): AppPreferences {
  return {
    defaultSemester: getSuggestedSemester(),
    defaultCourseStatus: "PLANNED",
    defaultScoreType: "PERCENTAGE",
    importConfirmRequired: true,
    backupBeforeImport: true,
    autoSelectNextPendingScore: true,
  };
}

function normalizePreferences(value: unknown): AppPreferences {
  const defaults = getDefaultPreferences();

  if (!value || typeof value !== "object") {
    return defaults;
  }

  const input = value as Partial<AppPreferences>;

  return {
    defaultSemester:
      typeof input.defaultSemester === "string" && input.defaultSemester.trim()
        ? input.defaultSemester.trim()
        : defaults.defaultSemester,
    defaultCourseStatus:
      input.defaultCourseStatus === "COMPLETED" ? "COMPLETED" : defaults.defaultCourseStatus,
    defaultScoreType: input.defaultScoreType === "GRADE" ? "GRADE" : defaults.defaultScoreType,
    importConfirmRequired:
      typeof input.importConfirmRequired === "boolean"
        ? input.importConfirmRequired
        : defaults.importConfirmRequired,
    backupBeforeImport:
      typeof input.backupBeforeImport === "boolean"
        ? input.backupBeforeImport
        : defaults.backupBeforeImport,
    autoSelectNextPendingScore:
      typeof input.autoSelectNextPendingScore === "boolean"
        ? input.autoSelectNextPendingScore
        : defaults.autoSelectNextPendingScore,
  };
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    if (typeof window === "undefined") {
      return getDefaultPreferences();
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return normalizePreferences(stored ? JSON.parse(stored) : null);
    } catch {
      return getDefaultPreferences();
    }
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({
      preferences,
      updatePreferences: (patch) => {
        setPreferences((current) => normalizePreferences({ ...current, ...patch }));
      },
      resetPreferences: () => {
        setPreferences(getDefaultPreferences());
      },
    }),
    [preferences],
  );

  return (
    <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (context === null) {
    throw new Error("useAppPreferences must be used within AppPreferencesProvider.");
  }
  return context;
}

