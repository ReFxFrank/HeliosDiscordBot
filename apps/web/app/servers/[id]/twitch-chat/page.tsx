import { redirect } from 'next/navigation';

/** The Twitch bot moved to its own section. */
export default async function OldTwitchChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/servers/${id}/twitch`);
}
