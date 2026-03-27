import LegalDocumentPage from "@/components/legal/LegalDocumentPage";

const sections = [
  {
    title: "1. Quem somos e quando esta politica se aplica",
    paragraphs: [
      "A SG Esports IA e a camada digital de atendimento da Santos Games Arena para triagem, suporte e captacao de interesse em eventos, campeonatos, experiencias gamer e canais de relacionamento da operacao.",
      "Esta Politica de Privacidade se aplica ao uso do painel, automacoes, atendimentos por WhatsApp, Instagram, Facebook e formularios conectados a plataforma hospedada em zap.santos-games.com.",
    ],
  },
  {
    title: "2. Dados que podemos coletar",
    paragraphs: [
      "Os dados tratados variam conforme o canal utilizado e o objetivo do contato. Em geral, coletamos apenas o necessario para identificar o interessado, responder duvidas, organizar inscricoes e registrar historico de atendimento.",
    ],
    bullets: [
      "Dados de identificacao e contato, como nome, telefone, identificador do canal e e-mail quando informado.",
      "Mensagens trocadas com a plataforma, incluindo texto, arquivos enviados, horario, assunto e historico de atendimento.",
      "Informacoes de triagem de campeonatos, como jogo, edicao, data, categoria, cidade, time e quantidade de jogadores.",
      "Dados tecnicos e operacionais para seguranca, auditoria, autenticao e investigacao de falhas.",
    ],
  },
  {
    title: "3. Como usamos essas informacoes",
    paragraphs: [
      "Usamos os dados para responder mensagens, qualificar leads, organizar inscricoes, executar handoff humano, gerar historico, prevenir abuso e melhorar a qualidade do atendimento automatizado.",
      "Tambem podemos usar esses dados para cumprir obrigacoes legais, resolver disputas, analisar incidentes e manter a continuidade operacional do servico.",
    ],
  },
  {
    title: "4. Compartilhamento com terceiros e fornecedores",
    paragraphs: [
      "A plataforma depende de provedores e integracoes para operar. O compartilhamento ocorre de forma restrita ao minimo necessario para processamento, armazenamento, entrega de mensagens e execucao de modelos de IA.",
    ],
    bullets: [
      "Meta Platforms, para trafego de mensagens e integracoes de WhatsApp, Instagram e Facebook.",
      "OpenAI e provedores equivalentes de IA, quando uma mensagem precisa ser analisada ou respondida por modelos de linguagem.",
      "Provedores de hospedagem, banco de dados, cache, monitoramento, seguranca e armazenamento de arquivos.",
    ],
  },
  {
    title: "5. Retencao, seguranca e controle",
    paragraphs: [
      "Mantemos registros enquanto houver necessidade operacional, contratual, legal ou de seguranca. O periodo de retencao pode variar conforme o tipo de dado, o status do lead e obrigacoes aplicaveis.",
      "Adotamos medidas tecnicas e administrativas razoaveis para restringir acesso indevido, manter rastreabilidade e reduzir riscos de vazamento, uso indevido ou perda de dados.",
    ],
  },
  {
    title: "6. Seus direitos",
    paragraphs: [
      "O titular pode solicitar confirmacao de tratamento, acesso, correcao, atualizacao, exclusao quando cabivel, revisao humana de decisoes automatizadas e informacoes sobre compartilhamento de dados.",
      "Quando o pedido depender de validacao de identidade ou de requisitos legais, poderemos solicitar dados adicionais antes de concluir a demanda.",
    ],
  },
  {
    title: "7. Como solicitar exclusao ou suporte",
    paragraphs: [
      "Pedidos relacionados a privacidade, exclusao de historico, correcao de dados, descadastramento ou revisao humana podem ser enviados para o canal oficial informado nesta pagina.",
      "Ao entrar em contato, informe o maximo de contexto possivel, como nome, canal utilizado e data aproximada do atendimento, para acelerar a localizacao do registro.",
    ],
  },
] as const;

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      badge="Documento Publico"
      title="Politica de Privacidade"
      description="Esta pagina descreve como a SG Esports IA coleta, usa, compartilha, protege e retira dados tratados durante o atendimento digital da Santos Games Arena."
      lastUpdated="27/03/2026"
      contactLabel="Canal de privacidade"
      contactValue="sg.studio.tm@gmail.com"
      contactHref="mailto:sg.studio.tm@gmail.com?subject=Privacidade%20SG%20Esports%20IA"
      highlights={[
        { label: "Controlador", value: "Santos Games Arena / SG Esports IA" },
        { label: "Canais abrangidos", value: "Painel web, WhatsApp, Instagram, Facebook e integrações conectadas" },
        { label: "Dados principais", value: "Contato, historico de mensagens, dados de triagem e logs operacionais" },
        { label: "Uso principal", value: "Atendimento, qualificacao de leads, suporte, inscricoes e auditoria" },
      ]}
      sections={[...sections]}
      footerNote={
        <p>
          Esta politica deve permanecer acessivel publicamente, sem necessidade de login.
          Se a operacao, os fornecedores ou o canal de contato mudarem, este documento deve
          ser atualizado antes de novas coletas.
        </p>
      }
    />
  );
}
