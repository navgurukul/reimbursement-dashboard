// src/lib/leave-status.ts
import { format } from "date-fns";
import supabase from "@/lib/supabase";

export interface LeaveDurationData {
  label: string;
  start: string | null; // ISO timestamp
  end: string | null;   // ISO timestamp, null if "Don't clear"
}

export interface ParsedLeaveStatus extends LeaveDurationData {
  isExpired: boolean;
  isActive: boolean;
}

/**
 * Given a preset or custom selection, compute the exact start and end ISO dates
 */
export function calculateLeaveTimes(
  presetOrType: string,
  customStart?: string,
  customEnd?: string
): LeaveDurationData {
  const now = new Date();

  switch (presetOrType) {
    case "3 minutes": {
      const end = new Date(now.getTime() + 3 * 60 * 1000);
      return {
        label: "3 minutes",
        start: now.toISOString(),
        end: end.toISOString(),
      };
    }

    case "Today": {
      // End of current day (23:59:59.999)
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return {
        label: "Today",
        start: now.toISOString(),
        end: end.toISOString(),
      };
    }

    case "Tomorrow": {
      // End of tomorrow (23:59:59.999)
      const end = new Date(now);
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 59, 999);
      return {
        label: "Tomorrow",
        start: now.toISOString(),
        end: end.toISOString(),
      };
    }



    case "custom":
    default: {
      const startDate = customStart ? new Date(customStart) : now;
      const endDate = customEnd ? new Date(customEnd) : null;

      let label = presetOrType;
      if (endDate) {
        try {
          const eFmt = format(endDate, "dd MMM yyyy, hh:mm a");
          if (startDate) {
            const sFmt = format(startDate, "dd MMM yyyy, hh:mm a");
            label = `${sFmt} – ${eFmt}`;
          } else {
            label = `Until ${eFmt}`;
          }
        } catch {
          label = customEnd || "Custom";
        }
      }

      return {
        label,
        start: startDate.toISOString(),
        end: endDate ? endDate.toISOString() : null,
      };
    }
  }
}

/**
 * Encodes leave duration into a JSON string for storage in `profiles.leave_duration`
 */
export function encodeLeaveDuration(data: LeaveDurationData): string {
  return JSON.stringify(data);
}

/**
 * Parses raw leave_duration from the database.
 * Supports both JSON encoded format and legacy plain string format.
 */
export function parseLeaveDuration(
  raw: string | null | undefined,
  updatedAt?: string | null
): ParsedLeaveStatus {
  if (!raw || raw.trim() === "") {
    return {
      label: "",
      start: null,
      end: null,
      isExpired: true,
      isActive: false,
    };
  }

  let label = raw;
  let start: string | null = null;
  let end: string | null = null;

  // 1. Try parsing JSON format
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        label = parsed.label || "";
        start = parsed.start || null;
        end = parsed.end || null;
      }
    } catch {
      // Not JSON, continue to fallback
    }
  }

  const now = new Date();
  let isExpired = false;

  // 2. Legacy fallback for plain strings (e.g. "30 minutes", "Today")
  if (!start && !end) {
    if (raw === "Don't clear") {
      start = updatedAt ? new Date(updatedAt).toISOString() : now.toISOString();
      end = null;
      isExpired = false;
    } else {
      if (!updatedAt) {
        // Stale plain preset without a recorded timestamp is treated as expired
        isExpired = true;
      } else {
        const baseDate = new Date(updatedAt);
        if (isNaN(baseDate.getTime())) {
          isExpired = true;
        } else {
          let durationMs = 0;
          if (raw === "3 minutes") durationMs = 3 * 60 * 1000;
          else if (raw === "5 minutes") durationMs = 5 * 60 * 1000;
          else if (raw === "30 minutes") durationMs = 30 * 60 * 1000;
          else if (raw === "1 hour") durationMs = 60 * 60 * 1000;
          else if (raw === "4 hours") durationMs = 4 * 60 * 60 * 1000;
          else if (raw === "Today") {
            const endDay = new Date(baseDate);
            endDay.setHours(23, 59, 59, 999);
            durationMs = endDay.getTime() - baseDate.getTime();
          } else if (raw === "Tomorrow") {
            const endTomorrow = new Date(baseDate);
            endTomorrow.setDate(endTomorrow.getDate() + 1);
            endTomorrow.setHours(23, 59, 59, 999);
            durationMs = endTomorrow.getTime() - baseDate.getTime();
          } else if (raw === "This week") {
            const endWeek = new Date(baseDate);
            const day = endWeek.getDay();
            const diffToSunday = day === 0 ? 0 : 7 - day;
            endWeek.setDate(endWeek.getDate() + diffToSunday);
            endWeek.setHours(23, 59, 59, 999);
            durationMs = endWeek.getTime() - baseDate.getTime();
          }

          if (durationMs > 0) {
            const calcEnd = new Date(baseDate.getTime() + durationMs);
            start = baseDate.toISOString();
            end = calcEnd.toISOString();
            isExpired = calcEnd.getTime() <= now.getTime();
          } else {
            isExpired = true;
          }
        }
      }
    }
  } else {
    if (end) {
      const endDate = new Date(end);
      if (!isNaN(endDate.getTime())) {
        isExpired = endDate.getTime() <= now.getTime();
      }
    }
  }

  // Active check: Must be started (start <= now) AND not expired (now <= end)
  let isStarted = true;
  if (start) {
    const startDate = new Date(start);
    if (!isNaN(startDate.getTime())) {
      isStarted = startDate.getTime() <= now.getTime();
    }
  }

  const isActive = isStarted && !isExpired;

  return {
    label,
    start,
    end,
    isExpired,
    isActive,
  };
}

/**
 * Returns effective display name (returns null if status is expired or not yet active)
 */
export function getEffectiveDisplayName(
  displayName: string | null | undefined,
  rawDuration: string | null | undefined,
  updatedAt?: string | null
): string | null {
  if (!displayName || displayName.trim() === "") return null;
  if (!rawDuration || rawDuration.trim() === "") return null;

  const parsed = parseLeaveDuration(rawDuration, updatedAt);
  if (parsed.isExpired || !parsed.isActive) {
    return null;
  }
  return displayName;
}

/**
 * Scans a list of profiles for expired leave status,
 * updates the database to clear them (`display_name: null`, `leave_duration: null`),
 * and returns the list of expired user IDs.
 */
export async function cleanExpiredLeaveProfiles(profilesList: any[]): Promise<string[]> {
  if (!profilesList || profilesList.length === 0) return [];

  const expiredProfiles = profilesList.filter((p) => {
    if (!p.display_name && !p.leave_duration) return false;
    // Missing duration when display_name is set means it should be cleaned
    if (!p.leave_duration || p.leave_duration.trim() === "") return true;
    const parsed = parseLeaveDuration(p.leave_duration, p.updated_at);
    return parsed.isExpired;
  });

  if (expiredProfiles.length === 0) return [];

  const idsToClear = expiredProfiles.map((p) => p.id).filter(Boolean);
  const userIdsToClear = expiredProfiles.map((p) => p.user_id).filter(Boolean);

  // Directly update Supabase profiles
  try {
    if (idsToClear.length > 0) {
      await supabase
        .from("profiles")
        .update({
          display_name: null,
          leave_duration: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", idsToClear);
    }
    if (userIdsToClear.length > 0) {
      await supabase
        .from("profiles")
        .update({
          display_name: null,
          leave_duration: null,
          updated_at: new Date().toISOString(),
        })
        .in("user_id", userIdsToClear);
    }
  } catch (err) {
    console.error("Error cleaning expired leave profiles on client:", err);
  }

  return [...idsToClear, ...userIdsToClear];
}
