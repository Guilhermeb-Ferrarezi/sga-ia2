interface OpenAIOutputItem {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIOutputItem[];
}

const MAX_WHATSAPP_TEXT_SIZE = 3500;

const trimForWhatsApp = (text: string): string => {
  if (text.length <= MAX_WHATSAPP_TEXT_SIZE) return text;
  return `${text.slice(0, MAX_WHATSAPP_TEXT_SIZE - 1)}...`;
};

const safeParseText = (payload: OpenAIResponseBody): string => {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
};

export class OpenAIService {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly appName: string,
  ) {}

  async generateReply(userMessage: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `You are ${this.appName}, an assistant replying inside WhatsApp. Keep responses concise and practical.`,
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
        max_output_tokens: 350,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `OpenAI request failed (${response.status}): ${details || "no details"}`,
      );
    }

    const payload = (await response.json()) as OpenAIResponseBody;
    const text = safeParseText(payload);
    if (!text) {
      return "Nao consegui gerar uma resposta agora. Tente novamente em instantes.";
    }

    return trimForWhatsApp(text);
  }
}
