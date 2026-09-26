/**
 * Receptionist voices a shop can pick. Cartesia Sonic stock voices: in the
 * voice sim they started speaking ~150ms sooner than ElevenLabs flash, and
 * Sonic speaks Spanish with the same voice.
 */
export const VOICE_PROVIDER = "cartesia";
export const VOICE_MODEL = "sonic-2";

export const RECEPTIONIST_VOICES = [
  { id: "c894559e-d529-4d70-a6fb-3330ecf7ef6b", label: "Iris", description: "Warm · female" },
  { id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4", label: "Skylar", description: "Bright · female" },
  { id: "55deba52-bc73-4481-ab69-9c8831c8a7c3", label: "Camille", description: "Calm · female" },
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Greg", description: "Deep · male" },
  { id: "5fc5c797-12c5-4f2b-ac9b-d4e53c08098f", label: "Wyatt", description: "Easygoing · male" },
  { id: "d46abd1d-2d02-43e8-819f-51fb652c1c61", label: "Grant", description: "Clear · male" },
] as const;

export const DEFAULT_VOICE_ID = RECEPTIONIST_VOICES[0].id;

/** Shops that picked an ElevenLabs voice keep a voice of the same character. */
const LEGACY_VOICES: Record<string, string> = {
  "21m00Tcm4TlvDq8ikWAM": RECEPTIONIST_VOICES[0].id,
  EXAVITQu4vr4xnSDxMaL: RECEPTIONIST_VOICES[1].id,
  XrExE9yKIg1WjnnlVkGX: RECEPTIONIST_VOICES[2].id,
  pNInz6obpgDQGcFmaJgB: RECEPTIONIST_VOICES[3].id,
  TxGEqnHWrfWFTfGW9XjX: RECEPTIONIST_VOICES[4].id,
  nPczCjzI2devNBz1zQrb: RECEPTIONIST_VOICES[5].id,
};

export function isReceptionistVoice(id: unknown): id is string {
  return typeof id === "string" && RECEPTIONIST_VOICES.some((voice) => voice.id === id);
}

export function resolveVoiceId(id: string | null | undefined): string {
  if (isReceptionistVoice(id)) return id;
  return (id && LEGACY_VOICES[id]) || DEFAULT_VOICE_ID;
}
