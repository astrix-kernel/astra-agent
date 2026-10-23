import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  companionStateFromAgentEvent,
  detailForState,
  type CompanionState,
} from '@astra/core';

export type TerminalImageProtocol = 'kitty' | 'iterm2' | 'sixel' | 'none';

export interface TerminalCapabilities {
  protocol: TerminalImageProtocol;
  colorDepth: number;
  columns: number;
  rows: number;
  isInteractive: boolean;
  reducedMotion: boolean;
}

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  pink: '\u001b[38;5;217m',
  deepPink: '\u001b[38;5;211m',
  gold: '\u001b[38;5;222m',
  amber: '\u001b[38;5;215m',
  sky: '\u001b[38;5;117m',
  blue: '\u001b[38;5;111m',
  white: '\u001b[38;5;231m',
  soft: '\u001b[38;5;250m',
  dimmed: '\u001b[38;5;244m',
} as const;

/** Detects terminal graphics capabilities without breaking on plain terminals. */
export function detectTerminalCapabilities(env: NodeJS.ProcessEnv = process.env): TerminalCapabilities {
  const term = env['TERM'] ?? '';
  const termProgram = env['TERM_PROGRAM'] ?? '';
  const columns = Number(env['COLUMNS'] ?? 80) || 80;
  const rows = Number(env['LINES'] ?? 24) || 24;
  const colorDepth = Number(env['COLORTERM']?.includes('truecolor') ? 16777216 : 256) || 256;
  const isInteractive = Boolean(process.stdout.isTTY);

  let protocol: TerminalImageProtocol = 'none';
  if (env['KITTY_WINDOW_ID'] || term.includes('kitty')) protocol = 'kitty';
  else if (termProgram === 'iTerm.app' || env['ITERM_SESSION_ID']) protocol = 'iterm2';
  else if (env['TERM_PROGRAM'] === 'WezTerm' || term.includes('wezterm')) protocol = 'kitty';
  else if (term.includes('sixel') || env['SIXEL'] === '1') protocol = 'sixel';

  const reducedMotion = env['ASTRA_REDUCED_MOTION'] === '1' || env['NO_COLOR'] !== undefined;

  return { protocol, colorDepth, columns, rows, isInteractive, reducedMotion };
}

/** Compact terminal portrait of Aemeath: pink hair, gold eyes, blue halo. */
const FRAMES: Record<CompanionState, string[][]> = {
  idle: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  listening: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  >   <  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  thinking: [
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  planning: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  speaking: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  >   <  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  using_tool: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  waiting_for_approval: [
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  o   o  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  success: [
    ['      .~~~~~.      ', '    /  ^   ^  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  ^   ^  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  error: [
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
  cancelled: [
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
    ['      .~~~~~.      ', '    /  -   -  \\\\    ', '   |     ^     |   ', '   |     ~     |   ', '    \\\\_/   /    ', '     \'-._.-\'      ', '       |||        ', '    .-~~~~~~~-.    '],
  ],
};

/** Colour mapping per state so the sprite reads at a glance. */
const STATE_COLOURS: Record<CompanionState, { hair: string; eye: string; halo: string }> = {
  idle: { hair: ANSI.pink, eye: ANSI.gold, halo: ANSI.sky },
  listening: { hair: ANSI.pink, eye: ANSI.gold, halo: ANSI.sky },
  thinking: { hair: ANSI.pink, eye: ANSI.amber, halo: ANSI.blue },
  planning: { hair: ANSI.pink, eye: ANSI.amber, halo: ANSI.blue },
  speaking: { hair: ANSI.deepPink, eye: ANSI.gold, halo: ANSI.sky },
  using_tool: { hair: ANSI.pink, eye: ANSI.amber, halo: ANSI.blue },
  waiting_for_approval: { hair: ANSI.amber, eye: ANSI.gold, halo: ANSI.amber },
  success: { hair: ANSI.pink, eye: ANSI.gold, halo: ANSI.sky },
  error: { hair: ANSI.dimmed, eye: ANSI.dimmed, halo: ANSI.dimmed },
  cancelled: { hair: ANSI.dimmed, eye: ANSI.dimmed, halo: ANSI.dimmed },
};

const HALO = '.-~~~-.';
const HALO_WING_L = '\\';
const HALO_WING_R = '/';

export interface CompanionRendererOptions {
  capabilities?: TerminalCapabilities;
  /** Root directory used to look up optional artwork. */
  assetRoot?: string;
}

export class TerminalCompanion {
  private readonly capabilities: TerminalCapabilities;
  private readonly assetRoot: string;
  private frame = 0;
  private state: CompanionState = 'idle';
  private timer: NodeJS.Timeout | undefined;

  constructor(options: CompanionRendererOptions = {}) {
    this.capabilities = options.capabilities ?? detectTerminalCapabilities();
    this.assetRoot = options.assetRoot ?? path.join(process.cwd(), 'assets', 'companion', 'aemeath');
  }

  get currentState(): CompanionState {
    return this.state;
  }

  /** Converts a raw agent event into a companion transition. */
  handleEvent(event: { type: string; task?: { state: string }; tool?: string; error?: string; text?: string }): void {
    const next = companionStateFromAgentEvent(event);
    if (!next) return;
    this.setState(next.state);
    if (next.detail) this.lastDetail = next.detail;
    if (next.tool) this.lastTool = next.tool;
    if (next.speech) this.lastSpeech = next.speech;
  }

  private lastDetail = 'Ready';
  private lastTool: string | undefined;
  private lastSpeech: string | undefined;

  setState(state: CompanionState): void {
    if (this.state === state) return;
    this.state = state;
    this.frame = 0;
    this.lastDetail = detailForState(state);
    this.lastSpeech = undefined;
    this.restartAnimation();
  }

  private restartAnimation(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.capabilities.reducedMotion) return;
    this.timer = setInterval(() => {
      this.frame += 1;
    }, 420);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Locates an optional transparent sprite so graphical terminals can show it. */
  private findSprite(): string | undefined {
    const candidates = [
      path.join(this.assetRoot, 'sprite', `aemeath-${this.state}.png`),
      path.join(this.assetRoot, 'sprite', 'aemeath-idle.png'),
    ];
    return candidates.find(candidate => existsSync(candidate));
  }

  /** Renders the Kitty graphics escape sequence for a PNG sprite. */
  private renderKitty(spritePath: string): string | undefined {
    try {
      const data = readFileSync(spritePath);
      const base64 = data.toString('base64');
      const chunks: string[] = [];
      for (let index = 0; index < base64.length; index += 4096) {
        chunks.push(base64.slice(index, index + 4096));
      }
      let payload = '';
      for (const chunk of chunks) {
        payload += `\u001b_Gm=1;${Buffer.from(chunk, 'base64').toString('base64')}\u001b\\`;
      }
      return `\u001b_Ga=T,f=100,t=d,q=2;${payload}\u001b\\`;
    } catch {
      return undefined;
    }
  }

  /** Renders the iTerm2 inline image escape sequence. */
  private renderITerm(spritePath: string): string | undefined {
    try {
      const data = readFileSync(spritePath);
      const base64 = data.toString('base64');
      return `\u001b]1337;File=inline=1;preserveAspectRatio=0;size=12:${base64}\u0007`;
    } catch {
      return undefined;
    }
  }

  /** Renders the compact ANSI portrait used on text-only terminals. */
  renderAscii(): string {
    const colours = STATE_COLOURS[this.state];
    const frames = FRAMES[this.state];
    const frame = frames[this.frame % frames.length] ?? frames[0] ?? [];
    const art = frame
      .map((row, index) => {
        if (index === 0) return `${colours.halo}${row}${ANSI.reset}`;
        if (index <= 2) return `${colours.eye}${row}${ANSI.reset}`;
        if (index === frame.length - 1) return `${colours.halo}${row}${ANSI.reset}`;
        return `${colours.hair}${row}${ANSI.reset}`;
      })
      .join('\n');
    const halo = `${colours.halo}${HALO}${ANSI.reset}`;
    const marker =
      this.state === 'success' ? `${ANSI.deepPink}♥${ANSI.reset}`
      : this.state === 'error' ? `${ANSI.dimmed}✖${ANSI.reset}`
      : this.state === 'waiting_for_approval' ? `${ANSI.amber}?${ANSI.reset}`
      : this.state === 'speaking' ? `${ANSI.deepPink}✦${ANSI.reset}`
      : this.state === 'using_tool' ? `${ANSI.blue}⚙${ANSI.reset}`
      : this.state === 'thinking' || this.state === 'planning' ? `${ANSI.amber}…${ANSI.reset}`
      : `${ANSI.dimmed}·${ANSI.reset}`;
    return `${halo}\n${art}\n${halo}  ${marker} ${colours.halo}${HALO_WING_L}${HALO_WING_R}${ANSI.reset}`;
  }

  /** Full companion frame including status and optional speech. */
  render(): string {
    const capability = this.capabilities;
    if (capability.protocol === 'kitty' || capability.protocol === 'iterm2') {
      const sprite = this.findSprite();
      if (sprite) {
        const graphic = capability.protocol === 'kitty' ? this.renderKitty(sprite) : this.renderITerm(sprite);
        if (graphic) return `${graphic}\n`;
      }
    }
    return this.renderAscii();
  }

  /** Compact one-line status used in prompt lines. */
  statusLine(): string {
    const label = this.lastDetail || detailForState(this.state);
    const tool = this.lastTool ? ` (${this.lastTool})` : '';
    const colour = this.state === 'error' ? ANSI.dimmed : this.state === 'success' ? ANSI.gold : ANSI.soft;
    return `${colour}Aemeath${ANSI.reset} ${ANSI.dimmed}[${this.state}]${ANSI.reset} ${colour}${label}${tool}${ANSI.reset}`;
  }

  speech(): string | undefined {
    return this.lastSpeech;
  }

  /**
   * Renders a spoken line in the terminal, with the character on top so it
   * reads like she is saying it rather than plain stdout.
   */
  renderSpeech(text: string): string {
    const art = this.renderAscii();
    const wrapped = text
      .split(/\s+/)
      .reduce<string[]>((lines, word) => {
        const current = lines[lines.length - 1] ?? '';
        if ((current + ' ' + word).trim().length > 52) lines.push(word);
        else lines[lines.length - 1] = (current + ' ' + word).trim();
        return lines;
      }, [])
      .join('\n');
    return `${art}${ANSI.pink}Aemeath:${ANSI.reset} ${wrapped}\n`;
  }

  detail(): string {
    return this.lastDetail;
  }
}
