import {
  DEFAULT_TITLE,
  MAX_TEAM_COUNT,
  MIN_TEAM_COUNT,
} from "@/lib/config";

export function normalizeRoomCode(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export function parseTeamCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_TEAM_COUNT ||
    parsed > MAX_TEAM_COUNT
  ) {
    return null;
  }

  return parsed;
}

export function cleanDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  if (trimmed.length < 1 || trimmed.length > 32) {
    return null;
  }

  return trimmed;
}

export function cleanTitle(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_TITLE;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : DEFAULT_TITLE;
}

export function makeInitials(displayName: string) {
  const parts = displayName
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "?";
}
