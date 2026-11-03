import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type BaseMessageOptions,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { RolePanelMode, RolePanelOption, RolePanelType } from '@refx/shared';
import { brandedEmbed } from '../lib/embeds';
import { buildCustomId } from '../framework/customId';

export interface RoleChange {
  add: string[];
  remove: string[];
}

/** Pure logic: which roles to add/remove when a panel button is clicked. */
export function buttonRoleChange(
  mode: RolePanelMode,
  panelRoleIds: string[],
  current: Set<string>,
  clicked: string,
): RoleChange {
  if (!panelRoleIds.includes(clicked)) return { add: [], remove: [] };
  const has = current.has(clicked);

  if (mode === 'VERIFY') return has ? { add: [], remove: [] } : { add: [clicked], remove: [] };
  if (mode === 'UNIQUE') {
    if (has) return { add: [], remove: [clicked] };
    return {
      add: [clicked],
      remove: panelRoleIds.filter((id) => id !== clicked && current.has(id)),
    };
  }
  return has ? { add: [], remove: [clicked] } : { add: [clicked], remove: [] };
}

/** Pure logic: which roles to add/remove when a panel select is submitted. */
export function selectRoleChange(
  mode: RolePanelMode,
  panelRoleIds: string[],
  current: Set<string>,
  selected: string[],
): RoleChange {
  const chosen = selected.filter((id) => panelRoleIds.includes(id));

  if (mode === 'UNIQUE') {
    const one = chosen.slice(0, 1);
    return {
      add: one.filter((id) => !current.has(id)),
      remove: panelRoleIds.filter((id) => !one.includes(id) && current.has(id)),
    };
  }
  if (mode === 'VERIFY') {
    return { add: chosen.filter((id) => !current.has(id)), remove: [] };
  }
  return {
    add: chosen.filter((id) => !current.has(id)),
    remove: panelRoleIds.filter((id) => !chosen.includes(id) && current.has(id)),
  };
}

export interface PanelData {
  id: string;
  title: string;
  description: string | null;
  mode: RolePanelMode;
  type: RolePanelType;
  options: RolePanelOption[];
}

function safeEmoji<T extends { setEmoji(emoji: string): unknown }>(
  builder: T,
  emoji?: string,
): void {
  if (!emoji) return;
  try {
    builder.setEmoji(emoji);
  } catch {
    /* invalid emoji string — render without one */
  }
}

/** Build the panel message (embed + button rows or a select menu). */
export function buildPanelMessage(panel: PanelData): BaseMessageOptions {
  const embed = brandedEmbed({ title: panel.title, description: panel.description ?? undefined });
  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] =
    panel.type === 'SELECT' ? buildSelect(panel) : buildButtons(panel);
  return { embeds: [embed], components };
}

function buildButtons(panel: PanelData): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  let row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
  for (const option of panel.options) {
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    }
    const button = new ButtonBuilder()
      .setCustomId(buildCustomId('roles', 'btn', panel.id, option.roleId))
      .setLabel(option.label)
      .setStyle(ButtonStyle.Secondary);
    safeEmoji(button, option.emoji);
    row.addComponents(button);
  }
  if (row.components.length) rows.push(row);
  return rows.slice(0, 5);
}

function buildSelect(panel: PanelData): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId('roles', 'sel', panel.id))
    .setMinValues(0)
    .setMaxValues(panel.mode === 'UNIQUE' ? 1 : panel.options.length)
    .setPlaceholder('Select roles…');
  for (const option of panel.options) {
    const built = new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setValue(option.roleId);
    safeEmoji(built, option.emoji);
    if (option.description) built.setDescription(option.description);
    menu.addOptions(built);
  }
  return [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)];
}
