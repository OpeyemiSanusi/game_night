import { StateBadge } from "@/components/StateBadge";
import type { PublicRoomState } from "@/lib/types";

interface RoomStatusHeaderProps {
  state: PublicRoomState;
  realtimeEnabled?: boolean;
}

export function RoomStatusHeader({
  state,
  realtimeEnabled = false,
}: RoomStatusHeaderProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <StateBadge label={state.phase.replaceAll("_", " ")} tone="cyan" />
            <StateBadge
              label={realtimeEnabled ? "Live" : "Refresh Ready"}
              tone={realtimeEnabled ? "green" : "neutral"}
            />
          </div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">
            {state.title}
          </h1>
          <p className="mt-1 text-sm font-semibold text-white/55">
            {state.teamCount} teams, {state.lobby.playerCount} players
          </p>
        </div>
        <div className="rounded-2xl bg-black/30 px-4 py-3 text-left sm:text-right">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-white/40">
            Room Code
          </div>
          <div className="text-3xl font-black tracking-[0.16em] text-yellow-200">
            {state.roomCode}
          </div>
        </div>
      </div>
    </div>
  );
}
