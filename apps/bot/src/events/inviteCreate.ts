import { Events } from 'discord.js';
import { defineEvent } from '../framework/event';
import { onInviteCreate } from '../modules/inviteTracking';

export default defineEvent({
  name: Events.InviteCreate,
  execute(_ctx, invite) {
    onInviteCreate(invite);
  },
});
