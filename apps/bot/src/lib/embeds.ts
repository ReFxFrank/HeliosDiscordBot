import { BRAND, COLORS } from '@refx/shared';
import { EmbedBuilder, type ColorResolvable } from 'discord.js';

type EmbedKind = 'default' | 'success' | 'warning' | 'danger' | 'info';

const KIND_COLOR: Record<EmbedKind, number> = {
  default: COLORS.brand,
  success: COLORS.success,
  warning: COLORS.warning,
  danger: COLORS.danger,
  info: COLORS.info,
};

interface BrandedEmbedOptions {
  kind?: EmbedKind;
  title?: string;
  description?: string;
}

/** Branded embed factory — consistent color, footer, and timestamp (§5.3). */
export function brandedEmbed({
  kind = 'default',
  title,
  description,
}: BrandedEmbedOptions = {}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(KIND_COLOR[kind] as ColorResolvable)
    .setFooter({ text: BRAND.footer })
    .setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

/** Convenience helpers for common ephemeral responses. */
export function successEmbed(description: string, title?: string): EmbedBuilder {
  return brandedEmbed({ kind: 'success', title, description });
}

export function errorEmbed(description: string, title = 'Something went wrong'): EmbedBuilder {
  return brandedEmbed({ kind: 'danger', title, description });
}
