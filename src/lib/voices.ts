/**
 * Receptionist voices a shop can pick. ElevenLabs premade voices, so they
 * work on any account without cloning, and all run on the flash model.
 */
export const RECEPTIONIST_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "Warm, calm · female" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", description: "Bright, friendly · female" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda", description: "Steady, reassuring · female" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Deep, confident · male" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", description: "Relaxed, friendly · male" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian", description: "Clear, professional · male" },
] as const;

export const DEFAULT_VOICE_ID = RECEPTIONIST_VOICES[0].id;

export function isReceptionistVoice(id: unknown): id is string {
  return typeof id === "string" && RECEPTIONIST_VOICES.some((voice) => voice.id === id);
}

export function resolveVoiceId(id: string | null | undefined): string {
  return isReceptionistVoice(id) ? id : DEFAULT_VOICE_ID;
}
