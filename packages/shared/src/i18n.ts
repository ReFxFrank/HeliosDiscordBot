/**
 * Localization foundation. System replies the bot sends on its own behalf
 * (gates, fallbacks, unexpected errors) translate to the member's Discord
 * client language via `interaction.locale` — zero configuration and correct
 * per-user. Guild-facing announcement text (welcome, level-up, panels, …) is
 * already free-form per-guild dashboard config, so owners write those in
 * their community's language directly.
 *
 * To add a language: extend SUPPORTED_LOCALES + MESSAGES (the `satisfies`
 * check makes a missing key a compile error). To localize a new string, add a
 * key to every locale and call `t(interaction.locale, key)`.
 */

export const SUPPORTED_LOCALES = ['en', 'es', 'de', 'fr', 'pt'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type MessageKey =
  | 'blacklisted'
  | 'commandDisabled'
  | 'moduleDisabled'
  | 'cannotUseCommand'
  | 'unexpectedError';

const MESSAGES = {
  en: {
    blacklisted: 'You or this server are blocked from using this bot.',
    commandDisabled: 'This command is disabled on this server.',
    moduleDisabled: 'That module is disabled on this server.',
    cannotUseCommand: 'You cannot use this command.',
    unexpectedError: 'An unexpected error occurred while running that command.',
  },
  es: {
    blacklisted: 'Este bot está bloqueado para ti o para este servidor.',
    commandDisabled: 'Este comando está desactivado en este servidor.',
    moduleDisabled: 'Ese módulo está desactivado en este servidor.',
    cannotUseCommand: 'No puedes usar este comando.',
    unexpectedError: 'Ocurrió un error inesperado al ejecutar ese comando.',
  },
  de: {
    blacklisted: 'Du oder dieser Server seid für die Nutzung dieses Bots gesperrt.',
    commandDisabled: 'Dieser Befehl ist auf diesem Server deaktiviert.',
    moduleDisabled: 'Dieses Modul ist auf diesem Server deaktiviert.',
    cannotUseCommand: 'Du kannst diesen Befehl nicht verwenden.',
    unexpectedError: 'Beim Ausführen des Befehls ist ein unerwarteter Fehler aufgetreten.',
  },
  fr: {
    blacklisted: 'L’accès à ce bot est bloqué pour vous ou pour ce serveur.',
    commandDisabled: 'Cette commande est désactivée sur ce serveur.',
    moduleDisabled: 'Ce module est désactivé sur ce serveur.',
    cannotUseCommand: 'Vous ne pouvez pas utiliser cette commande.',
    unexpectedError: 'Une erreur inattendue est survenue lors de l’exécution de cette commande.',
  },
  pt: {
    blacklisted: 'Você ou este servidor estão bloqueados de usar este bot.',
    commandDisabled: 'Este comando está desativado neste servidor.',
    moduleDisabled: 'Esse módulo está desativado neste servidor.',
    cannotUseCommand: 'Você não pode usar este comando.',
    unexpectedError: 'Ocorreu um erro inesperado ao executar esse comando.',
  },
} as const satisfies Record<SupportedLocale, Record<MessageKey, string>>;

/**
 * Map a Discord locale tag (`es-ES`, `es-419`, `pt-BR`, `de`, …) to a
 * supported locale, falling back to English.
 */
export function resolveLocale(discordLocale: string | undefined): SupportedLocale {
  if (!discordLocale) return 'en';
  const base = discordLocale.toLowerCase().split('-')[0] as SupportedLocale;
  return SUPPORTED_LOCALES.includes(base) ? base : 'en';
}

/** Translate a system message into the given Discord locale. */
export function t(discordLocale: string | undefined, key: MessageKey): string {
  return MESSAGES[resolveLocale(discordLocale)][key];
}
