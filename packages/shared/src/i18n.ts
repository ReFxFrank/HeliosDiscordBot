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
  | 'unexpectedError'
  | 'dailyClaimed'
  | 'dailyBonusNote'
  | 'dailyAlreadyClaimed'
  | 'workCooldown'
  | 'paidUser'
  | 'voteAlreadyClaimed'
  | 'voteThanks';

const MESSAGES = {
  en: {
    blacklisted: 'You or this server are blocked from using this bot.',
    commandDisabled: 'This command is disabled on this server.',
    moduleDisabled: 'That module is disabled on this server.',
    cannotUseCommand: 'You cannot use this command.',
    unexpectedError: 'An unexpected error occurred while running that command.',
    dailyClaimed: '🎁 You claimed your daily {amount}!',
    dailyBonusNote: '_(includes a {amount} income-role bonus)_',
    dailyAlreadyClaimed: "You've already claimed today. Come back in **{time}**.",
    workCooldown: "You're worn out. Try again in **{time}**.",
    paidUser: '💸 You paid {user} {amount}.',
    voteAlreadyClaimed: 'You already claimed this vote here. You can vote again in **{time}**.',
    voteThanks: '🗳️ Thanks for voting! You claimed {amount}.',
  },
  es: {
    blacklisted: 'Este bot está bloqueado para ti o para este servidor.',
    commandDisabled: 'Este comando está desactivado en este servidor.',
    moduleDisabled: 'Ese módulo está desactivado en este servidor.',
    cannotUseCommand: 'No puedes usar este comando.',
    unexpectedError: 'Ocurrió un error inesperado al ejecutar ese comando.',
    dailyClaimed: '🎁 ¡Reclamaste tu recompensa diaria de {amount}!',
    dailyBonusNote: '_(incluye un bono de {amount} por rol de ingresos)_',
    dailyAlreadyClaimed: 'Ya reclamaste hoy. Vuelve en **{time}**.',
    workCooldown: 'Estás agotado. Inténtalo de nuevo en **{time}**.',
    paidUser: '💸 Le pagaste {amount} a {user}.',
    voteAlreadyClaimed: 'Ya reclamaste este voto aquí. Puedes votar de nuevo en **{time}**.',
    voteThanks: '🗳️ ¡Gracias por votar! Reclamaste {amount}.',
  },
  de: {
    blacklisted: 'Du oder dieser Server seid für die Nutzung dieses Bots gesperrt.',
    commandDisabled: 'Dieser Befehl ist auf diesem Server deaktiviert.',
    moduleDisabled: 'Dieses Modul ist auf diesem Server deaktiviert.',
    cannotUseCommand: 'Du kannst diesen Befehl nicht verwenden.',
    unexpectedError: 'Beim Ausführen des Befehls ist ein unerwarteter Fehler aufgetreten.',
    dailyClaimed: '🎁 Du hast deine tägliche Belohnung von {amount} abgeholt!',
    dailyBonusNote: '_(enthält einen Bonus von {amount} durch Einkommensrollen)_',
    dailyAlreadyClaimed: 'Du hast heute schon abgeholt. Komm in **{time}** wieder.',
    workCooldown: 'Du bist erschöpft. Versuch es in **{time}** erneut.',
    paidUser: '💸 Du hast {user} {amount} gezahlt.',
    voteAlreadyClaimed:
      'Du hast diese Stimme hier schon eingelöst. Du kannst in **{time}** erneut abstimmen.',
    voteThanks: '🗳️ Danke für deine Stimme! Du hast {amount} erhalten.',
  },
  fr: {
    blacklisted: 'L’accès à ce bot est bloqué pour vous ou pour ce serveur.',
    commandDisabled: 'Cette commande est désactivée sur ce serveur.',
    moduleDisabled: 'Ce module est désactivé sur ce serveur.',
    cannotUseCommand: 'Vous ne pouvez pas utiliser cette commande.',
    unexpectedError: 'Une erreur inattendue est survenue lors de l’exécution de cette commande.',
    dailyClaimed: '🎁 Vous avez réclamé votre récompense quotidienne de {amount} !',
    dailyBonusNote: '_(inclut un bonus de {amount} grâce aux rôles de revenu)_',
    dailyAlreadyClaimed: 'Vous avez déjà réclamé aujourd’hui. Revenez dans **{time}**.',
    workCooldown: 'Vous êtes épuisé. Réessayez dans **{time}**.',
    paidUser: '💸 Vous avez payé {amount} à {user}.',
    voteAlreadyClaimed:
      'Vous avez déjà réclamé ce vote ici. Vous pourrez revoter dans **{time}**.',
    voteThanks: '🗳️ Merci d’avoir voté ! Vous avez reçu {amount}.',
  },
  pt: {
    blacklisted: 'Você ou este servidor estão bloqueados de usar este bot.',
    commandDisabled: 'Este comando está desativado neste servidor.',
    moduleDisabled: 'Esse módulo está desativado neste servidor.',
    cannotUseCommand: 'Você não pode usar este comando.',
    unexpectedError: 'Ocorreu um erro inesperado ao executar esse comando.',
    dailyClaimed: '🎁 Você resgatou sua recompensa diária de {amount}!',
    dailyBonusNote: '_(inclui um bônus de {amount} por cargo de renda)_',
    dailyAlreadyClaimed: 'Você já resgatou hoje. Volte em **{time}**.',
    workCooldown: 'Você está exausto. Tente novamente em **{time}**.',
    paidUser: '💸 Você pagou {amount} para {user}.',
    voteAlreadyClaimed:
      'Você já resgatou este voto aqui. Você pode votar novamente em **{time}**.',
    voteThanks: '🗳️ Obrigado por votar! Você resgatou {amount}.',
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

/**
 * Translate a message into the given Discord locale, substituting `{name}`
 * placeholders from `vars` (values are inserted verbatim).
 */
export function t(
  discordLocale: string | undefined,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let message: string = MESSAGES[resolveLocale(discordLocale)][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      message = message.replaceAll(`{${name}}`, String(value));
    }
  }
  return message;
}
