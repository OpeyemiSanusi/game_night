import { PlayerRoom } from "@/components/PlayerRoom";

interface PlayerPageProps {
  params: Promise<{
    roomCode: string;
  }>;
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { roomCode } = await params;

  return <PlayerRoom roomCode={roomCode} />;
}
