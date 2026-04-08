import { describe, expect, it } from "bun:test";
import {
  didMessageOfferHumanHandoff,
  hasExplicitHumanHandoffRequest,
  isHandoffConfirmationReply,
} from "./handoffIntent";

describe("hasExplicitHumanHandoffRequest", () => {
  it("detects direct requests for a human", () => {
    expect(hasExplicitHumanHandoffRequest("quero falar com um atendente")).toBe(true);
    expect(hasExplicitHumanHandoffRequest("preciso de ajuda com horario")).toBe(false);
    expect(hasExplicitHumanHandoffRequest("me transfere para um humano")).toBe(true);
  });

  it("does not treat a generic help request as a human handoff", () => {
    expect(
      hasExplicitHumanHandoffRequest("ola, preciso de ajuda com algumas informacoes"),
    ).toBe(false);
    expect(hasExplicitHumanHandoffRequest("preciso de suporte para inscricao")).toBe(
      false,
    );
    expect(hasExplicitHumanHandoffRequest("como funciona o atendimento humano ai?")).toBe(
      false,
    );
    expect(hasExplicitHumanHandoffRequest("quero ajuda com as regras")).toBe(false);
  });
});

describe("isHandoffConfirmationReply", () => {
  it("detects short confirmation replies", () => {
    expect(isHandoffConfirmationReply("beleza")).toBe(true);
    expect(isHandoffConfirmationReply("Pode sim")).toBe(true);
    expect(isHandoffConfirmationReply("quero saber a data")).toBe(false);
  });
});

describe("didMessageOfferHumanHandoff", () => {
  it("detects explicit handoff offers", () => {
    expect(
      didMessageOfferHumanHandoff(
        "Excelente! Vou encaminhar sua duvida para a equipe e aviso assim que tiver retorno.",
      ),
    ).toBe(true);
  });

  it("detects team verification offers that end in a short confirmation ask", () => {
    expect(
      didMessageOfferHumanHandoff(
        "Para a data certa, vou confirmar com a equipe e te aviso. Quer que eu ja faca isso?",
      ),
    ).toBe(true);
  });

  it("does not flag normal informational replies", () => {
    expect(
      didMessageOfferHumanHandoff(
        "O proximo campeonato abre inscricoes na sexta e comeca no sabado.",
      ),
    ).toBe(false);
  });

  it("does not treat forwarding details to the user as human handoff", () => {
    expect(
      didMessageOfferHumanHandoff(
        "Voce precisa formar seu time e fazer a inscricao com a SGA. Quer que eu encaminhe os detalhes para voce?",
      ),
    ).toBe(false);
  });
});
