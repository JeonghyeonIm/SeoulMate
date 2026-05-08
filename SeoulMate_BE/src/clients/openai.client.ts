import { env } from "../config/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

interface ResponsesApiOutputText {
  type?: string;
  text?: string;
}

interface ResponsesApiMessage {
  type?: string;
  content?: ResponsesApiOutputText[];
}

interface ResponsesApiResponse {
  output_text?: string;
  output?: ResponsesApiMessage[];
  error?: {
    message?: string;
  };
}

interface JsonResponseOptions {
  input: string;
  instructions: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  maxOutputTokens?: number;
}

interface TextResponseOptions {
  input: string;
  instructions: string;
  model?: string;
  maxOutputTokens?: number;
}

const extractOutputText = (payload: ResponsesApiResponse): string => {
  if (payload.output_text) {
    return payload.output_text;
  }

  const text = payload.output
    ?.flatMap((message) => message.content ?? [])
    .filter((content) => content.type === "output_text" || typeof content.text === "string")
    .map((content) => content.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("OpenAI response did not include output text");
  }

  return text;
};

const createResponse = async (body: Record<string, unknown>): Promise<ResponsesApiResponse> => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as ResponsesApiResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed (${response.status})`);
  }

  return payload;
};

export const openaiClient = {
  isConfigured: (): boolean => Boolean(env.OPENAI_API_KEY),

  async createJsonResponse<T>({
    input,
    instructions,
    schemaName,
    schema,
    model = env.OPENAI_MODEL,
    maxOutputTokens = 800
  }: JsonResponseOptions): Promise<T> {
    const payload = await createResponse({
      model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
          strict: true
        }
      }
    });

    const text = extractOutputText(payload);

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown JSON parse error";
      throw new Error(`OpenAI JSON parse failed: ${message}`);
    }
  },

  async createTextResponse({
    input,
    instructions,
    model = env.OPENAI_MODEL,
    maxOutputTokens = 900
  }: TextResponseOptions): Promise<string> {
    const payload = await createResponse({
      model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens
    });

    return extractOutputText(payload);
  }
};
