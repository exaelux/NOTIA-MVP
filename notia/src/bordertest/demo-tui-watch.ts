import { loadScenarioProfile, type ScenarioProfile } from "./profile.js";
const C = "\x1b[1;36m", D = "\x1b[2;37m", W = "\x1b[1;37m", R = "\x1b[0m";
const HIDE = "\x1b[?25l", SHOW = "\x1b[?25h", CLEAR = "\x1b[2J\x1b[H";

const ENABLE_SCAN_EFFECT = process.env.NCR_WATCH_ANIMATE === "1";
const ALWAYS_ON = process.env.NOTIA_ALWAYS_ON === "1";
type ScanSnapshot = {
  epochMs: number;
  iso: string;
  date: string;
  time: string;
};

const LOGO = [
"⠯⠟⢉⡽⠏⠤⢤⣤⡤⠤⠄⢤⣤⠤⠴⠤⠤⠠⠤⠴⠤⠆⠤⠤⠤⠤⠄",
"⠉⠁⠉⠀⠉⠉⠉⠉⠁⠉⠀⠁⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
"⠀⠀⠀⠀⠀⠀⠰⣶⣿⣧⣄⠀⠀⠀⠀⢬⣽⣯⠀⠀⢀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⠀⢸⣿⣿⣿⣿⣿⣿⣿⣯⣴⣤",
"⠀⠀⠀⠀⠀⠀⠸⣿⣿⣿⣷⣤⡄⠄⠀⢸⣾⣧⠀⠔⣿⣿⠿⠛⠛⠛⠛⠛⠛⠛⠛⠀⢸⣿⣿⡟⠛⠛⠛⠛⢻⣿⢿⡆",
"⠀⠀⠀⠀⠀⠀⢸⣿⣿⡿⡿⢿⣿⠆⢀⣿⣿⣿⢈⠾⡿⣿⠷⢰⠈⠉⠁⠀⠉⠀⡁⠀⢸⣿⣿⣇⣀⣀⣀⣀⣸⣷⣶⠇",
"⠀⠀⠀⠀⠀⠀⢘⣿⣿⡇⠙⢻⣿⣛⡋⣙⣛⣛⣸⣘⣛⣛⣛⢸⠀⠀⠀⠀⠀⠀⠁⢀⣘⣿⣿⣿⣿⣿⣛⣛⣛⡛⠛",
"⠀⠀⠀⠀⠀⠀⠨⠭⡽⠇⠀⠀⠹⠟⣿⣽⣯⣯⠠⠤⣿⣭⡯⠀⠀⠀⠠⠀⠀⠀⠆⠰⠾⡿⢿⠦⠘⠛⠛⠻⠿⣿⣦",
"⠀⠀⠀⠀⠀⠀⢐⣒⣶⡇⠀⠀⠀⠑⢖⢒⠶⠖⠀⠘⠻⠿⠓⠲⠶⣶⣾⡶⠶⡶⣷⠘⢹⣟⣫⡋⠂⠀⠀⠀⢛⣩⣿⡆",
"⠀⠀⠀⠀⠀⠀⠠⠭⠽⠇⠀⠀⠀⠀⠈⠫⠿⠷⠀⠀⠀⠊⠿⠾⠿⠿⠿⠿⠿⠿⠿⠀⠸⠿⠿⠇⠀⠀⠀⠀⠸⠿⠿⠇",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const LINES_AFTER_LOGO = 9;

function getDateTime(): { date: string; time: string } {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    time: now.toLocaleTimeString("en-US", { hour12: false }),
  };
}

function makeScanSnapshot(at = new Date()): ScanSnapshot {
  return {
    epochMs: at.getTime(),
    iso: at.toISOString(),
    date: at.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    time: at.toLocaleTimeString("en-US", { hour12: false }),
  };
}

function supportsAnimatedUi(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY && process.env.TERM !== "dumb");
}

function renderPrelude(dimLogo: boolean, subtitleLine: string): void {
  const logoColor = dimLogo ? D : C;
  process.stdout.write(CLEAR + "\n");
  for (const line of LOGO) {
    process.stdout.write(logoColor + "  " + line + R + "\n");
  }
  process.stdout.write("\n");
  process.stdout.write(D + "  ─────────────────────────────────────\n" + R);
  process.stdout.write("  " + C + "NOTIA Compliance Runtime" + R + "\n");
  process.stdout.write(D + `  ${subtitleLine}\n` + R);
  process.stdout.write(D + "  ─────────────────────────────────────\n" + R);
  const { date, time } = getDateTime();
  process.stdout.write("\n");
  process.stdout.write(D + "  " + date + R + "\n");
  process.stdout.write(C + "  " + time + R + "\n");
  process.stdout.write("\n");
}

function paintLogoLineFromSavedCursor(lineIndex: number, color: string): void {
  const offset = LOGO.length + LINES_AFTER_LOGO - lineIndex;
  const line = LOGO[lineIndex] as string;
  process.stdout.write(`\x1b[u\x1b[${offset}A\r\x1b[2K${color}  ${line}${R}`);
}

async function runScanEffect(): Promise<void> {
  process.stdout.write(HIDE + "\x1b[s");
  try {
    for (let i = 0; i < LOGO.length; i++) {
      if (i > 0) {
        paintLogoLineFromSavedCursor(i - 1, C);
      }
      paintLogoLineFromSavedCursor(i, W);
      await sleep(65);
    }
    paintLogoLineFromSavedCursor(LOGO.length - 1, C);
    process.stdout.write("\x1b[u");
  } finally {
    process.stdout.write(SHOW);
  }
}

async function runPromptScan(prompt: string): Promise<void> {
  if (!process.stdout.isTTY) {
    return;
  }

  process.stdout.write(HIDE);
  try {
    for (let i = 0; i < prompt.length; i++) {
      const pre = prompt.slice(0, i);
      const cur = prompt[i] ?? "";
      const post = prompt.slice(i + 1);
      process.stdout.write(`\r\x1b[2K${D}${pre}${W}${cur}${D}${post}${R}`);
      await sleep(10);
    }
    process.stdout.write(`\r\x1b[2K${prompt}`);
  } finally {
    process.stdout.write(SHOW);
  }
}

function paintLiveTimeAbovePrompt(): void {
  const { time } = getDateTime();
  // Save cursor on prompt row, paint time row, then restore prompt cursor.
  process.stdout.write(`\x1b7\x1b[2A\r\x1b[2K${C}  ${time}${R}\x1b8`);
}

function waitForEnterInline(promptBase: string, alreadyRendered = false): Promise<ScanSnapshot> {
  if (!process.stdin.isTTY) {
    if (!alreadyRendered) {
      process.stdout.write(promptBase + "\n");
    }
    return Promise.resolve(makeScanSnapshot());
  }

  if (!alreadyRendered) {
    process.stdout.write(promptBase);
  }

  paintLiveTimeAbovePrompt();
  const clockInterval = setInterval(paintLiveTimeAbovePrompt, 1000);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const input = chunk.toString("utf8");

      if (input === "\u0003") {
        clearInterval(clockInterval);
        process.stdin.off("data", onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(130);
      }

      if (!input.includes("\r") && !input.includes("\n")) {
        return;
      }

      clearInterval(clockInterval);
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();

      const snapshot = makeScanSnapshot();
      // Keep the transition seamless: replace the prompt row in place.
      process.stdout.write("\r\x1b[2K");
      resolve(snapshot);
    };

    process.stdin.on("data", onData);
  });
}

async function waitForScan(subtitleLine: string, forceManual = false): Promise<ScanSnapshot> {
  if (ALWAYS_ON && !forceManual) {
    renderPrelude(false, subtitleLine);
    await sleep(250);
    return makeScanSnapshot();
  }

  const prompt = "  Press ENTER to start NCR runtime... ";

  if (ENABLE_SCAN_EFFECT && supportsAnimatedUi()) {
    renderPrelude(true, subtitleLine);
    await runScanEffect();
    await runPromptScan(prompt);
    return waitForEnterInline(prompt, true);
  } else {
    renderPrelude(false, subtitleLine);
    return waitForEnterInline(prompt);
  }
}

async function main(): Promise<void> {
  const { main: demoMain } = await import("./demo-tui.js");
  const profile: ScenarioProfile = await loadScenarioProfile();
  const subtitleLine = `${profile.label} · ${profile.networkLabel} · ${profile.runtimeVersion}`;
  let forceManualResume = false;
  while (true) {
    const scanSnapshot = await waitForScan(subtitleLine, forceManualResume);
    const nextAction = await demoMain({ showHeader: false, scanSnapshot, profile });
    forceManualResume = nextAction === "to_header_pause";
    if (nextAction !== "to_header" && nextAction !== "to_header_pause") {
      return;
    }
  }
}

void main();
