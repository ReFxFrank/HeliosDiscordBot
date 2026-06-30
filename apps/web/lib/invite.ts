/**
 * Bot invite URL with the scopes + permissions Helios needs. The permission
 * integer is the OR of a curated, least-surprise set for an all-features
 * moderation bot (no blanket Administrator).
 */
const PERMISSIONS = [
  0x400n, // View Channels
  0x10n, // Manage Channels
  0x10000000n, // Manage Roles
  0x2n, // Kick Members
  0x4n, // Ban Members
  0x10000000000n, // Moderate Members (timeout)
  0x2000n, // Manage Messages
  0x800n, // Send Messages
  0x4000n, // Embed Links
  0x10000n, // Read Message History
  0x40n, // Add Reactions
  0x20n, // Manage Server
  0x20000000n, // Manage Webhooks
  0x8000000n, // Manage Nicknames
  0x4000000n, // Change Nickname
  0x100000n, // Connect (voice)
  0x200000n, // Speak
  0x400000n, // Mute Members
  0x1000000n, // Move Members
].reduce((acc, bit) => acc | bit, 0n);

export function botInviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: PERMISSIONS.toString(),
    scope: 'bot applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
