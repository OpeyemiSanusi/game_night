import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export interface DedupablePlayerRow {
  id: string;
  display_name: string;
  join_order: number;
  status: string;
  is_connected?: boolean | null;
  last_seen_at?: string | null;
}

export function normalizePlayerDisplayName(displayName: string) {
  return displayName.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function statusRank(status: string) {
  if (status === "active") {
    return 0;
  }

  if (status === "pending") {
    return 1;
  }

  return 2;
}

function lastSeenMs(player: DedupablePlayerRow) {
  return player.last_seen_at ? Date.parse(player.last_seen_at) || 0 : 0;
}

function preferredPlayer<T extends DedupablePlayerRow>(
  current: T,
  candidate: T,
  preferredPlayerId?: string,
) {
  if (candidate.id === preferredPlayerId) {
    return candidate;
  }

  if (current.id === preferredPlayerId) {
    return current;
  }

  const statusDelta = statusRank(candidate.status) - statusRank(current.status);

  if (statusDelta < 0) {
    return candidate;
  }

  if (statusDelta > 0) {
    return current;
  }

  if (Boolean(candidate.is_connected) !== Boolean(current.is_connected)) {
    return candidate.is_connected ? candidate : current;
  }

  const candidateLastSeen = lastSeenMs(candidate);
  const currentLastSeen = lastSeenMs(current);

  if (candidateLastSeen !== currentLastSeen) {
    return candidateLastSeen > currentLastSeen ? candidate : current;
  }

  return candidate.join_order > current.join_order ? candidate : current;
}

export function uniquePlayersByDisplayName<T extends DedupablePlayerRow>(
  players: T[],
  preferredPlayerId?: string,
) {
  const playerByName = new Map<string, T>();

  for (const player of players) {
    if (player.status === "inactive") {
      continue;
    }

    const normalizedName = normalizePlayerDisplayName(player.display_name);

    if (!normalizedName) {
      continue;
    }

    const current = playerByName.get(normalizedName);
    playerByName.set(
      normalizedName,
      current ? preferredPlayer(current, player, preferredPlayerId) : player,
    );
  }

  const visiblePlayerIds = new Set(
    Array.from(playerByName.values(), (player) => player.id),
  );

  return players.filter((player) => visiblePlayerIds.has(player.id));
}

export async function deactivateDuplicatePlayerNames(
  supabase: SupabaseAdmin,
  roomId: string,
  preferredPlayerId?: string,
) {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, display_name, join_order, status, is_connected, last_seen_at")
    .eq("room_id", roomId)
    .neq("status", "inactive")
    .order("join_order", { ascending: true })
    .returns<DedupablePlayerRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const visiblePlayers = uniquePlayersByDisplayName(
    players || [],
    preferredPlayerId,
  );
  const visiblePlayerIds = new Set(visiblePlayers.map((player) => player.id));
  const duplicatePlayerIds = (players || [])
    .filter((player) => !visiblePlayerIds.has(player.id))
    .map((player) => player.id);

  if (duplicatePlayerIds.length === 0) {
    return [];
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({ status: "inactive", team_id: null })
    .in("id", duplicatePlayerIds)
    .eq("room_id", roomId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return duplicatePlayerIds;
}
