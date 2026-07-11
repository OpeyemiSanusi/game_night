import { Avatar } from "@/components/Avatar";
import type { PublicRoomState } from "@/lib/types";

interface TeamGridProps {
  state: PublicRoomState;
  compact?: boolean;
}

export function TeamGrid({ state, compact = false }: TeamGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {state.teams.map((team) => (
        <section
          key={team.id}
          className="rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
          style={{ borderTop: `5px solid ${team.color}` }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-[0.24em] text-white/45">
                Team {team.teamIndex + 1}
              </div>
              <h2 className="truncate text-xl font-black text-white">
                {team.name}
              </h2>
            </div>
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-black text-black"
              style={{ backgroundColor: team.color }}
            >
              {team.icon}
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between rounded-2xl bg-black/25 px-3 py-2 text-sm">
            <span className="font-semibold text-white/60">Players</span>
            <span className="font-black text-white">{team.playerCount}</span>
          </div>

          <div className={compact ? "space-y-2" : "space-y-3"}>
            {team.players.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 px-3 py-5 text-center text-sm font-semibold text-white/40">
                Waiting for players
              </div>
            ) : (
              team.players.map((player) => (
                <div
                  key={player.id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2"
                >
                  <Avatar player={player} size={compact ? "sm" : "md"} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-white">
                      {player.displayName}
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                      {player.status}
                    </div>
                  </div>
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      player.isConnected ? "bg-emerald-300" : "bg-white/25"
                    }`}
                    aria-label={player.isConnected ? "Connected" : "Idle"}
                  />
                </div>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
