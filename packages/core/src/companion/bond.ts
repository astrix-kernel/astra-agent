/**
 * Emotional continuity for the companion.
 *
 * Aemeath should feel like she has been around for a while, not that she
 * spawned from nothing each time the page loads. The bond tracks how much you
 * have interacted, which unlocks warmer behaviour over time.
 */

export interface CompanionBond {
  version: 1;
  /** Number of conversations the user has had with her. */
  conversations: number;
  /** Total messages exchanged. */
  messages: number;
  /** Number of remembered notes about the user. */
  notes: number;
  /** 0 to 100, how familiar she feels with the user. */
  familiarity: number;
  updatedAt: number;
}

export const COMPANION_BOND_LIMIT = 500;

export function emptyCompanionBond(): CompanionBond {
  return { version: 1, conversations: 0, messages: 0, notes: 0, familiarity: 0, updatedAt: Date.now() };
}

export function parseCompanionBond(raw: string | null | undefined): CompanionBond {
  if (!raw) return emptyCompanionBond();
  try {
    const parsed = JSON.parse(raw) as Partial<CompanionBond>;
    if (!parsed || parsed.version !== 1) return emptyCompanionBond();
    const number = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    return {
      version: 1,
      conversations: number(parsed.conversations),
      messages: number(parsed.messages),
      notes: number(parsed.notes),
      familiarity: Math.max(0, Math.min(100, number(parsed.familiarity))),
      updatedAt: number(parsed.updatedAt, Date.now()),
    };
  } catch {
    return emptyCompanionBond();
  }
}

/** Records one exchange and grows the bond a little. */
export function recordInteraction(bond: CompanionBond, options: { message?: boolean; newConversation?: boolean; note?: boolean } = {}): CompanionBond {
  const conversations = bond.conversations + (options.newConversation ? 1 : 0);
  const messages = Math.min(COMPANION_BOND_LIMIT, bond.messages + (options.message ? 1 : 0));
  const notes = bond.notes + (options.note ? 1 : 0);
  // Familiarity grows quickly at first and then slows down.
  const gained = conversations > 0 ? 6 : 2;
  const familiarity = Math.max(0, Math.min(100, bond.familiarity + gained));
  return { version: 1, conversations, messages, notes, familiarity, updatedAt: Date.now() };
}

/** How she addresses the user, based on how well she knows them. */
export function companionAddressStyle(bond: CompanionBond): 'casual' | 'friendly' | 'close' {
  if (bond.familiarity >= 60) return 'close';
  if (bond.familiarity >= 25) return 'friendly';
  return 'casual';
}

/** A line that reflects how familiar she feels. */
export function companionBondLine(bond: CompanionBond): string | undefined {
  const style = companionAddressStyle(bond);
  if (style === 'close') {
    const lines = ['Aku senang kamu balik lagi~', 'Sering ketemu kamu, Senator~', 'Yatta, kamu lagi!'];
    return lines[bond.conversations % lines.length];
  }
  if (style === 'friendly') {
    const lines = ['Hai, sudah familiar nih~', 'Senang lihat kamu lagi!', 'Kamu udah jadi teman deh~'];
    return lines[bond.conversations % lines.length];
  }
  return undefined;
}

/** Short status describing the bond, shown in the companion panel. */
export function companionBondSummary(bond: CompanionBond): string {
  if (bond.conversations === 0) return 'Baru bertemu';
  if (bond.familiarity >= 60) return `Teman dekat (${bond.conversations} percakapan)`;
  if (bond.familiarity >= 25) return `Sudah akrab (${bond.conversations} percakapan)`;
  return `Kenalan (${bond.conversations} percakapan)`;
}
