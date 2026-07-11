import Link from "next/link";
import { JoinRoomForm } from "@/components/JoinRoomForm";
import { StateBadge } from "@/components/StateBadge";

interface JoinPageProps {
  searchParams?: Promise<{
    room?: string;
  }>;
}

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = searchParams ? await searchParams : {};
  const initialRoomCode = params.room || "";

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-6 px-4 py-8">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          <StateBadge label="Player Phone" tone="pink" />
          <StateBadge label="Lobby" tone="cyan" />
        </div>
        <h1 className="text-4xl font-black text-white">Join the game</h1>
        <p className="mt-3 text-base font-semibold leading-7 text-white/60">
          Enter the room code from the TV or host screen. No account is needed.
        </p>
      </div>

      <JoinRoomForm initialRoomCode={initialRoomCode} />

      <Link
        href="/"
        className="text-center text-sm font-bold text-white/50 underline-offset-4 hover:text-white"
      >
        Create a host room instead
      </Link>
    </main>
  );
}
