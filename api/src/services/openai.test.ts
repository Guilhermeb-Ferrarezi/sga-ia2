import { describe, expect, it } from "bun:test";
import { buildRelevantFaqContext, type FaqCandidate } from "./openai";

const csPrimeFaq: FaqCandidate = {
  question: "Me passa os detalhes do CS Prime",
  answer: "O CS Prime 4a Edicao custa R$ 80,00 por jogador e acontece em 26/04/2026.",
  subject: "Counter-Strike 2 - CS Prime",
  edition: "4a Edicao",
  content: [
    "O CS Prime 4a Edicao e um campeonato presencial de Counter-Strike realizado na SGA em Ribeirao Preto/SP.",
    "Data: 26/04/2026 (domingo)\nInicio: 08h00",
    "Inscricao:\nR$ 80,00 por jogador\nPagamento disponivel por Pix ou cartao de credito, a vista.",
    "Local: Avenida Nove de Julho, 1992 - Jardim America",
  ].join("\n\n"),
};

const valorantFaq: FaqCandidate = {
  question: "Qual o valor do campeonato de Valorant?",
  answer: "O campeonato de Valorant custa R$ 120,00 por jogador.",
  subject: "Valorant",
  edition: "Elite Series",
  content: "Inscricao: R$ 120,00 por jogador.",
};

describe("buildRelevantFaqContext", () => {
  it("prioritizes the matching domain and includes the confirmed CS Prime price", () => {
    const context = buildRelevantFaqContext(
      [valorantFaq, csPrimeFaq],
      "quanto custa?",
      [
        {
          role: "user",
          content: [{ type: "input_text", text: "tem campeonato de que" }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "cs" }],
        },
      ],
      "Campeonato: CS Prime",
    );

    expect(context).toContain("Assunto: Counter-Strike 2 - CS Prime");
    expect(context).toContain("R$ 80,00 por jogador");
    expect(context).not.toContain("R$ 120,00 por jogador");
  });

  it("keeps overview facts when the user asks for general information", () => {
    const context = buildRelevantFaqContext(
      [csPrimeFaq],
      "me fala mais sobre esse campeonato",
      [],
      "Campeonato: CS Prime",
    );

    expect(context).toContain("Counter-Strike realizado na SGA");
    expect(context).toContain("26/04/2026");
  });
});
