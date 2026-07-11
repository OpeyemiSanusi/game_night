import Link from "next/link";
import { JoinRoomForm } from "@/components/JoinRoomForm";

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
      <div className="text-center">
        <h1 className="text-4xl font-black text-white">Join</h1>
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
