import Link from "next/link";
import { CreateRoomForm } from "@/components/CreateRoomForm";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-center gap-8 px-4 py-8">
      <section className="text-center">
        <h1 className="text-6xl font-black leading-none text-white sm:text-7xl">
          Who Said?
        </h1>
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
