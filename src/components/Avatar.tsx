import type { PlayerPublic } from "@/lib/types";

interface AvatarProps {
  player: Pick<PlayerPublic, "displayName" | "initials" | "avatarUrl">;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
};

export function Avatar({ player, size = "md" }: AvatarProps) {
  return (
    <div
      className={`${sizeClasses[size]} grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 font-black text-white shadow-[0_0_20px_rgba(255,255,255,0.08)]`}
      aria-label={player.displayName}
    >
      {player.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{player.initials}</span>
      )}
    </div>
  );
}
