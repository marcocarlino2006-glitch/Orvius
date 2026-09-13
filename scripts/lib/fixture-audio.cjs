/**
 * Writes dev-only call recordings so the audio surfaces can be exercised.
 *
 * The call player decodes the actual file to draw its waveform, which means it
 * cannot be reviewed — or regression-checked — against a fixture whose
 * recordingUrl is null. Vapi's real recordings are not ours to commit and a
 * silent tone would draw a flat line, so this synthesises something with the
 * shape of a two-party phone call: alternating turns of different length and
 * loudness, short gaps between them, and a noise floor in between.
 *
 * 8kHz mono 16-bit, which is what a phone call actually is. Written under
 * public/dev-fixture, which is gitignored — nothing here reaches a deployment.
 */
const { mkdirSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const RATE = 8000;
const DIR = join(process.cwd(), "public", "dev-fixture");

/** Deterministic, so two runs produce byte-identical files. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function wavHeader(samples) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples * 2, 40);
  return header;
}

/**
 * Turns are laid out first, then rendered, so the envelope is a property of the
 * conversation rather than of the waveform — the gaps land where a speaker
 * stopped talking, which is the thing the waveform exists to show.
 */
function layOutTurns(seconds, random) {
  const turns = [];
  let cursor = 0.4;
  let speaker = 1;
  while (cursor < seconds - 0.5) {
    const length = 1.1 + random() * (speaker === 0 ? 3.4 : 2.2);
    turns.push({
      start: cursor,
      end: Math.min(seconds - 0.2, cursor + length),
      /* The assistant is a clean recording and the caller is on a cell phone in
         a mechanical room, so they are nowhere near the same level. */
      gain: speaker === 0 ? 0.72 : 0.46,
      pitch: speaker === 0 ? 165 : 210,
    });
    cursor += length + 0.18 + random() * 0.5;
    speaker = speaker === 0 ? 1 : 0;
  }
  return turns;
}

function render(seconds, seed) {
  const random = seeded(seed);
  const turns = layOutTurns(seconds, random);
  const count = Math.floor(seconds * RATE);
  const pcm = Buffer.alloc(count * 2);

  let turnIndex = 0;
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    while (turnIndex < turns.length && t > turns[turnIndex].end) turnIndex++;
    const turn = turns[turnIndex];

    /* Line noise, always present — it is what makes the gaps read as a live
       line rather than as the end of the file. */
    let value = (random() - 0.5) * 0.02;

    if (turn && t >= turn.start) {
      /* Syllables. Voiced speech is a pitched carrier chopped at roughly four
         per second, and that chopping is most of what a waveform looks like. */
      const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4.1 * t);
      const ramp = Math.min(
        1,
        (t - turn.start) / 0.08,
        (turn.end - t) / 0.12,
      );
      const carrier =
        Math.sin(2 * Math.PI * turn.pitch * t) * 0.6 +
        Math.sin(2 * Math.PI * turn.pitch * 2 * t) * 0.25 +
        (random() - 0.5) * 0.3;
      value += carrier * syllable * ramp * turn.gain;
    }

    const clamped = Math.max(-1, Math.min(1, value));
    pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return Buffer.concat([wavHeader(count), pcm]);
}

/**
 * Returns the public URL for a recording of `seconds`, writing the file only if
 * it is not already on disk. Keyed by duration and seed, so callers with the
 * same length share one file instead of each carrying a copy.
 */
function fixtureRecording(seconds, seed) {
  mkdirSync(DIR, { recursive: true });
  const name = `call-${seconds}s-${seed}.wav`;
  const path = join(DIR, name);
  if (!existsSync(path)) writeFileSync(path, render(seconds, seed));
  return `/dev-fixture/${name}`;
}

module.exports = { fixtureRecording };
