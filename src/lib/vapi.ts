const VAPI_BASE = "https://api.vapi.ai";

type VapiAssistantPayload = {
  name: string;
  firstMessage: string;
  model: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  transcriber: {
    provider: string;
    model: string;
  };
  serverUrl?: string;
  serverUrlSecret?: string;
  endCallFunctionEnabled?: boolean;
  analysisPlan?: {
    summaryPlan?: { enabled: boolean };
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

export function buildVapiAssistantConfig(params: {
  businessName: string;
  systemPrompt: string;
  greeting: string;
  webhookUrl: string;
  webhookSecret?: string;
}): VapiAssistantPayload {
  return {
    name: `${params.businessName} Receptionist`,
    firstMessage: params.greeting,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: params.systemPrompt }],
    },
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
    },
    serverUrl: params.webhookUrl,
    serverUrlSecret: params.webhookSecret,
    endCallFunctionEnabled: true,
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Caller's full name",
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
            urgency: {
              type: "string",
              enum: ["emergency", "same-day", "this-week", "flexible"],
              description: "How urgent the request is",
            },
            address: {
              type: "string",
              description: "Service address or property location",
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
}

export type VapiWebhookMessage = {
  message: {
    type: string;
    call?: {
      id: string;
      assistantId?: string;
      customer?: { number?: string };
      phoneNumber?: { number?: string };
    };
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    durationSeconds?: number;
    analysis?: {
      summary?: string;
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
    urgency: typeof data.urgency === "string" ? data.urgency : undefined,
    address: typeof data.address === "string" ? data.address : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  };
}
