import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { onInviteDelete } from '../modules/inviteTracking';

export default defineEvent({
  name: Events.InviteDelete,
  execute(_ctx, invite) {
    onInviteDelete(invite.guild?.id, invite.code);
  },
});
