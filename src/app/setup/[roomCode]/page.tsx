import { HostRoom } from "@/components/HostRoom";

interface SetupPageProps {
  params: Promise<{
    roomCode: string;
  }>;
}

export default async function SetupPage({ params }: SetupPageProps) {
  const { roomCode } = await params;

  return <HostRoom roomCode={roomCode} view="setup" />;
}
