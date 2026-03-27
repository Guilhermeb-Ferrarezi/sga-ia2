import LegalDocumentPage from "@/components/legal/LegalDocumentPage";

const sections = [
  {
    title: "1. Sobre estes termos",
    paragraphs: [
      "Estes Termos de Uso regulam o acesso e o uso da SG Esports IA, plataforma de atendimento e operacao digital da Santos Games Arena para canais de mensagens, leads, campeonatos e suporte comercial.",
      "Ao interagir com a plataforma ou com seus canais integrados, o usuario reconhece que leu estes termos e concorda com o uso do servico dentro das regras descritas abaixo.",
    ],
  },
  {
    title: "2. Finalidade do servico",
    paragraphs: [
      "A plataforma existe para responder duvidas, organizar triagem, registrar historico, coletar dados de inscricao, apoiar equipes humanas e facilitar a operacao de eventos e experiencias gamer.",
      "O servico pode combinar respostas automatizadas, handoff humano, integracoes externas, modelos de IA e processos internos de verificacao.",
    ],
  },
  {
    title: "3. Regras de uso",
    paragraphs: [
      "Voce concorda em utilizar a plataforma de forma legitima, sem praticar fraude, spam, abuso, engenharia social, tentativa de acesso nao autorizado ou envio de conteudo ilicito.",
    ],
    bullets: [
      "Nao utilizar o servico para se passar por terceiros, manipular inscricoes ou burlar regras de eventos.",
      "Nao enviar conteudos ofensivos, discriminatorios, ilegais, fraudulentos ou que prejudiquem a operacao.",
      "Nao testar vulnerabilidades, automatizar ataques ou explorar falhas sem autorizacao expressa.",
    ],
  },
  {
    title: "4. Atendimento automatizado e limitacoes",
    paragraphs: [
      "Parte das interacoes e respondida por automacao e inteligencia artificial. Apesar do esforco para manter contexto e precisao, respostas podem exigir confirmacao humana em casos de excecao, dados sensiveis ou regras especificas do evento.",
      "A plataforma pode priorizar respostas informativas e operacionais, mas nao substitui validacao final quando houver exigencia contratual, financeira, juridica ou regulatoria.",
    ],
  },
  {
    title: "5. Responsabilidades do usuario",
    paragraphs: [
      "O usuario e responsavel pela veracidade das informacoes fornecidas, pelo uso adequado dos canais e pelo acompanhamento de instrucoes oficiais enviadas pela equipe da Santos Games Arena.",
      "Sempre que uma inscricao, compra, reembolso ou confirmacao depender de revisao humana, o usuario deve aguardar a conclusao formal pelos canais indicados.",
    ],
  },
  {
    title: "6. Suspensao, bloqueio e alteracoes",
    paragraphs: [
      "A plataforma pode limitar, suspender ou encerrar acessos quando identificar risco operacional, uso abusivo, descumprimento destes termos, tentativa de fraude ou exigencia legal.",
      "Tambem podemos alterar fluxos, integrações, politicas, telas e funcionalidades para atender mudancas de negocio, seguranca ou exigencias dos provedores conectados.",
    ],
  },
  {
    title: "7. Servicos de terceiros",
    paragraphs: [
      "Determinadas funcionalidades dependem de terceiros, incluindo Meta, provedores de IA, hospedagem, banco de dados e sistemas de mensageria. Indisponibilidades, limites ou politicas desses provedores podem impactar o servico.",
      "Quando isso ocorrer, a plataforma pode restringir recursos temporariamente ou redirecionar o atendimento para acompanhamento humano.",
    ],
  },
  {
    title: "8. Contato",
    paragraphs: [
      "Duvidas sobre estes termos, uso de dados, contestacoes operacionais, remocao de registros ou suporte podem ser encaminhadas ao canal oficial indicado nesta pagina.",
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <LegalDocumentPage
      badge="Documento Publico"
      title="Termos de Uso"
      description="Este documento define as condicoes de uso da plataforma SG Esports IA, seus canais integrados e o relacionamento digital com usuarios, leads e participantes de eventos."
      lastUpdated="27/03/2026"
      contactLabel="Canal oficial"
      contactValue="sg.studio.tm@gmail.com"
      contactHref="mailto:sg.studio.tm@gmail.com?subject=Termos%20SG%20Esports%20IA"
      highlights={[
        { label: "Operacao", value: "Santos Games Arena / SG Esports IA" },
        { label: "Finalidade", value: "Atendimento, triagem, suporte, leads e gestao operacional de eventos" },
        { label: "Modelo", value: "Automacao com IA, historico persistente e apoio humano quando necessario" },
        { label: "Abrangencia", value: "Canais web, WhatsApp, Instagram, Facebook e integracoes relacionadas" },
      ]}
      sections={[...sections]}
      footerNote={
        <p>
          O uso continuado da plataforma apos atualizacoes relevantes pode representar
          concordancia com a nova versao. Se voce nao concordar com os termos, interrompa o
          uso do servico e solicite atendimento pelos canais oficiais.
        </p>
      }
    />
  );
}
