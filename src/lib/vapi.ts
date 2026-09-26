import { createHash } from "node:crypto";
import { buildInCallTools } from "@/lib/in-call-tool-defs";
import { DEFAULT_VOICE_ID } from "@/lib/voices";
import { DEMAND_CATEGORY_CODES } from "@/lib/job-taxonomy";
import {
  getAiModelPolicy,
  getTranscriptionModel,
  TRANSCRIPTION_POLICY,
} from "@/lib/ai-policy";

const VAPI_BASE = "https://api.vapi.ai";

type VapiAssistantPayload = {
  name: string;
  firstMessage: string;
  model: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    tools?: Array<Record<string, unknown>>;
  };
  /** `orviusConfig` is a fingerprint of everything else, so drift from the deployed code is detectable. */
  metadata?: { orviusConfig: string };
  voice: {
    provider: string;
    voiceId: string;
    model?: string;
  };
  transcriber: {
    provider: string;
    model: string;
    language?: string;
  };
  startSpeakingPlan?: {
    waitSeconds?: number;
    transcriptionEndpointingPlan?: { onPunctuationSeconds?: number; onNoPunctuationSeconds?: number; onNumberSeconds?: number };
  };
  stopSpeakingPlan?: { numWords?: number; voiceSeconds?: number; backoffSeconds?: number };
  serverUrl?: string;
  serverUrlSecret?: string;
  /** Live call control lets the webhook hand the receptionist a returning-caller note. */
  monitorPlan?: { controlEnabled?: boolean; listenEnabled?: boolean };
  endCallFunctionEnabled?: boolean;
  analysisPlan?: {
    summaryPlan?: { enabled: boolean };
    successEvaluationPlan?: {
      enabled: boolean;
      rubric?: "NumericScale" | "PassFail" | "PercentageScale";
    };
    structuredDataPlan?: {
      enabled: boolean;
      schema: Record<string, unknown>;
    };
  };
};

function getVapiHeaders() {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error("VAPI_API_KEY is not configured");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function vapiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${VAPI_BASE}${path}`, {
    ...options,
    headers: {
      ...getVapiHeaders(),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vapi API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function createAssistant(payload: VapiAssistantPayload) {
  return vapiRequest<{ id: string }>("/assistant", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAssistant(
  assistantId: string,
  payload: Partial<VapiAssistantPayload>,
) {
  return vapiRequest<{ id: string }>(`/assistant/${assistantId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAssistant(assistantId: string) {
  return vapiRequest<void>(`/assistant/${assistantId}`, {
    method: "DELETE",
  });
}

export async function importTwilioPhoneToVapi(params: {
  number: string;
  assistantId: string;
  name: string;
}) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error("Twilio credentials are not configured");
  }

  const list = await vapiRequest<Array<{ id: string; number?: string }>>(
    "/phone-number?limit=100",
  );

  const normalized = params.number.replace(/\s/g, "");
  // A number imported more than once must not leave a copy routing to an old assistant.
  const existing = Array.isArray(list)
    ? list.filter(
        (entry) =>
          entry.number === params.number ||
          entry.number?.replace(/\s/g, "") === normalized,
      )
    : [];

  if (existing.length) {
    for (const entry of existing) {
      await vapiRequest(`/phone-number/${entry.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assistantId: params.assistantId }),
      });
    }
    return { id: existing[0].id, number: params.number };
  }

  const created = await vapiRequest<{ id: string }>("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      number: params.number,
      twilioAccountSid: sid,
      twilioAuthToken: token,
      assistantId: params.assistantId,
      name: params.name,
      smsEnabled: true,
    }),
  });

  return { id: created.id, number: params.number };
}

export function buildVapiAssistantConfig(params: {
  businessName: string;
  systemPrompt: string;
  greeting: string;
  webhookUrl: string;
  webhookSecret?: string;
  /** E.164 number to hand callers to when they insist on a person. */
  transferPhone?: string | null;
  voiceId?: string | null;
  /** Give the receptionist check_availability and hold_appointment. */
  inCallBooking?: boolean;
}): VapiAssistantPayload {
  const receptionist = getAiModelPolicy("receptionist");
  const tools: Array<Record<string, unknown>> = [
    ...(params.inCallBooking
      ? buildInCallTools({ webhookUrl: params.webhookUrl, webhookSecret: params.webhookSecret })
      : []),
    ...(params.transferPhone
      ? [
          {
            type: "transferCall",
            destinations: [
              {
                type: "number",
                number: params.transferPhone,
                message: "One moment, I'm connecting you now.",
                description: "The shop owner, for callers who ask for a person",
              },
            ],
          },
        ]
      : []),
  ];
  const config: VapiAssistantPayload = {
    name: `${params.businessName} Receptionist`,
    firstMessage: params.greeting,
    model: {
      provider: receptionist.provider,
      model: receptionist.model,
      messages: [{ role: "system", content: params.systemPrompt }],
      ...(tools.length ? { tools } : {}),
    },
    voice: {
      provider: "11labs",
      voiceId: params.voiceId || DEFAULT_VOICE_ID,
      // Multilingual and the lowest-latency ElevenLabs model; a slow reply is how callers spot a bot.
      model: "eleven_flash_v2_5",
    },
    transcriber: {
      provider: "deepgram",
      model: getTranscriptionModel(),
      language: TRANSCRIPTION_POLICY.language,
    },
    startSpeakingPlan: {
      waitSeconds: 0.3,
      // Vapi waits 1.5s after an unpunctuated transcript before replying; that pause measured as the slowest turn on live calls.
      // Digits get a longer wait than Vapi's 0.5s default: callers read numbers in groups, and 0.6s cut one off mid-number.
      transcriptionEndpointingPlan: { onPunctuationSeconds: 0.1, onNoPunctuationSeconds: 1, onNumberSeconds: 1 },
    },
    // A caller's "yeah" or "mm-hm" should not cut the receptionist off mid-sentence.
    stopSpeakingPlan: { numWords: 2, voiceSeconds: 0.3, backoffSeconds: 1 },
    serverUrl: params.webhookUrl,
    serverUrlSecret: params.webhookSecret,
    monitorPlan: { controlEnabled: true },
    endCallFunctionEnabled: true,
    analysisPlan: {
      summaryPlan: { enabled: true },
      successEvaluationPlan: {
        enabled: true,
        rubric: "NumericScale",
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Caller's full name, using the caller's own spelling if they spelled it out letter by letter",
            },
            phone: {
              type: "string",
              description: "Best callback phone number in E.164 if possible",
            },
            email: {
              type: "string",
              description: "Email if provided",
            },
            serviceType: {
              type: "string",
              description: "Requested service (HVAC, plumbing, etc.)",
            },
            jobCategory: {
              type: "string",
              enum: [...DEMAND_CATEGORY_CODES],
              description:
                "Closest matching job category code. Choose the single best match from the list; omit entirely if none fits rather than guessing.",
            },
            urgency: {
              type: "string",
              enum: ["emergency", "same-day", "this-week", "flexible"],
              description: "How urgent the request is",
            },
            address: {
              type: "string",
              description: "Service address or property location, using the caller's spelling of the street if they spelled it",
            },
            notes: {
              type: "string",
              description: "Additional details and appointment preference",
            },
          },
        },
      },
    },
  };
  return { ...config, metadata: { orviusConfig: assistantConfigFingerprint(config) } };
}

/** Stable hash of the assistant config, excluding webhook secrets and the fingerprint itself. */
export function assistantConfigFingerprint(config: VapiAssistantPayload): string {
  const { serverUrlSecret: _secret, metadata: _meta, ...rest } = config;
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
              .filter((k) => k !== "secret")
              .sort()
              .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
          )
        : value;
  return createHash("sha256").update(JSON.stringify(canonical(rest))).digest("hex").slice(0, 16);
}

export type VapiWebhookMessage = {
  message: {
    type: string;
    call?: {
      id: string;
      assistantId?: string;
      customer?: { number?: string };
      phoneNumber?: { number?: string };
      monitor?: { controlUrl?: string; listenUrl?: string };
    };
    status?: string;
    toolCallList?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    analysis?: {
      summary?: string;
      successEvaluation?: string | number | boolean | null;
      structuredData?: Record<string, unknown>;
    };
    endedReason?: string;
  };
};

export function extractLeadFromStructuredData(
  data: Record<string, unknown> | undefined,
) {
  if (!data) return {};

  return {
    name: typeof data.name === "string" ? data.name : undefined,
    phone: typeof data.phone === "string" ? data.phone : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    serviceType:
      typeof data.serviceType === "string" ? data.serviceType : undefined,
    jobCategory:
      typeof data.jobCategory === "string" ? data.jobCategory : undefined,
    urgency: typeof data.urgency === "string" ? data.urgency : undefined,
    address: typeof data.address === "string" ? data.address : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  };
}
