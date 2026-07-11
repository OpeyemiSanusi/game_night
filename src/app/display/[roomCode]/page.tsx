import { DisplayRoom } from "@/components/DisplayRoom";

interface DisplayPageProps {
  params: Promise<{
    roomCode: string;
  }>;
}

export default async function DisplayPage({ params }: DisplayPageProps) {
  const { roomCode } = await params;

  return <DisplayRoom roomCode={roomCode} />;
}
