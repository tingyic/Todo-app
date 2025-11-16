type SoundName = "add" | "delete" | "done" | "undo" | "redo" | "error" | "click" | "celebrate" | "celebrate-pro";

const ctxRef: { ctx: AudioContext | null } = { ctx: null };

function getAudioContext(): AudioContext {
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };

  if (!ctxRef.ctx) {
    const Constructor = g.AudioContext ?? g.webkitAudioContext;
    if (!Constructor) {
      throw new Error("Web Audio API not supported in this browser");
    }
    ctxRef.ctx = new Constructor();
  }
  return ctxRef.ctx!;
}

function playSound(name: SoundName, volume = 0.2) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // helper to create an oscillator with gain envelope
    const makeTone = (freqStart: number, freqEnd: number, type: OscillatorType, dur = 0.2, offset = 0) => {
      const t0 = now + offset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t0);
      // gentle ramp if freqEnd != freqStart
      if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);

      osc.connect(gain);

      gain.gain.cancelScheduledValues(t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);

      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
      };
    };

    switch (name) {
      case "add":
        makeTone(880, 880, "sine", 0.12, 0);
        break;
      case "delete":
        makeTone(220, 220, "sawtooth", 0.18, 0);
        break;
      case "done":
        makeTone(660, 660, "triangle", 0.14, 0);
        break;
      case "undo":
        makeTone(520, 520, "sine", 0.12, 0);
        break;
      case "redo":
        makeTone(760, 760, "sine", 0.12, 0);
        break;
      case "error":
        makeTone(180, 180, "sawtooth", 0.22, 0);
        break;
      case "click":
        makeTone(1200, 1200, "square", 0.06, 0);
        break;
      case "celebrate":
        makeTone(880, 1100, "triangle", 0.14, 0);
        makeTone(1100, 1400, "triangle", 0.12, 0.06);
        makeTone(1400, 1760, "triangle", 0.12, 0.12); 
        break;
      case "celebrate-pro":
        makeTone(880, 1100, "triangle", 0.14, 0);
        makeTone(1100, 1400, "triangle", 0.12, 0.06);
        makeTone(1400, 1760, "triangle", 0.12, 0.12);
        makeTone(1760, 2000, "sine", 0.12, 0.18);
        makeTone(2000, 2200, "sine", 0.12, 0.24);
        break;
    }
  } catch {
    // ignore failures silently (older browsers, permissions)
  }
}

export function haptic(pattern: number | number[] = 35) {
  try {
    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => unknown };
    if (typeof nav.vibrate === "function") nav.vibrate(pattern);
  } catch {
    /* no-op */
  }
}


export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem("todo-sound-enabled") !== "0";
  } catch {
    return true;
  }
}

export function setSoundEnabled(v: boolean) {
  try {
    localStorage.setItem("todo-sound-enabled", v ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Play: will respect isSoundEnabled(); optionally vibrate as well */
export function play(name: SoundName, doHaptic = false) {
  if (!isSoundEnabled()) return;
  playSound(name);
  if (doHaptic) haptic(25);
}
