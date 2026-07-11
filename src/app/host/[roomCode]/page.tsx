import { HostRoom } from "@/components/HostRoom";

interface HostPageProps {
  params: Promise<{
    roomCode: string;
  }>;
}

export default async function HostPage({ params }: HostPageProps) {
  const { roomCode } = await params;

  return <HostRoom roomCode={roomCode} view="host" />;
}
