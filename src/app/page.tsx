import Link from "next/link";
import { CreateRoomForm } from "@/components/CreateRoomForm";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-2xl content-center gap-8 px-4 py-8">
      <section className="text-center">
        <h1 className="text-6xl font-black leading-none text-white sm:text-7xl">
          Who Said?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base font-bold leading-7 text-white/55">
          Guess the speaker, win points for your team, and survive the round.
        </p>
      </section>

      <section className="grid gap-3 text-white">
        <h2 className="text-xl font-black">How to play</h2>
        <ol className="grid gap-2 text-sm font-bold leading-6 text-white/65 sm:text-base">
          <li>1. Join a room and get placed on a team.</li>
          <li>2. Each round, pick who you think sent the message.</li>
          <li>3. The lowest-scoring team faces the live punishment.</li>
          <li>4. Group leaders choose the lamb and the challenge for another team.</li>
        </ol>
      </section>

      <section className="grid gap-4">
        <Link
          href="/join"
          className="inline-flex h-16 w-full items-center justify-center rounded-2xl bg-pink-300 px-6 text-lg font-black text-black transition active:scale-[0.99]"
        >
          Join
        </Link>
        <CreateRoomForm />
      </section>
    </main>
  );
}
