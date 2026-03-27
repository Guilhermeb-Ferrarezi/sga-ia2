import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type LegalSection = {
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
};

type LegalHighlight = {
  label: string;
  value: string;
};

interface LegalDocumentPageProps {
  badge: string;
  title: string;
  description: string;
  lastUpdated: string;
  highlights: LegalHighlight[];
  contactLabel: string;
  contactValue: string;
  contactHref: string;
  sections: LegalSection[];
  footerNote: ReactNode;
}

const cardTransition = {
  duration: 0.55,
  ease: [0.16, 1, 0.3, 1] as const,
};

export default function LegalDocumentPage({
  badge,
  title,
  description,
  lastUpdated,
  highlights,
  contactLabel,
  contactValue,
  contactHref,
  sections,
  footerNote,
}: LegalDocumentPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
          animate={{ x: [0, 24, -12, 0], y: [0, 30, 18, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: 12, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-0 top-0 h-80 w-80 rounded-full bg-accent/20 blur-3xl"
          animate={{ x: [0, -28, 12, 0], y: [0, 18, 42, 0], scale: [1, 0.94, 1.06, 1] }}
          transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl"
          animate={{ x: [0, 18, -18, 0], y: [0, -22, 16, 0], opacity: [0.28, 0.42, 0.24, 0.28] }}
          transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={cardTransition}
          className="glass-panel rounded-[2rem] border border-white/10 px-5 py-5 shadow-[0_24px_80px_rgba(4,10,18,0.45)] sm:px-8 sm:py-7"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <Badge variant="secondary" className="w-fit border border-white/10 bg-white/10 text-white">
                {badge}
              </Badge>
              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-200/80 sm:text-base">
                  {description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                  <Link to="/login">
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o painel
                  </Link>
                </Button>
                <Button asChild className="bg-primary text-primary-foreground">
                  <a href={contactHref} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Falar com a equipe
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px] lg:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">
                  Ultima atualizacao
                </p>
                <p className="mt-2 text-lg font-semibold text-white">{lastUpdated}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">
                  {contactLabel}
                </p>
                <a
                  href={contactHref}
                  className="mt-2 inline-flex text-sm font-medium text-primary hover:text-primary/80"
                >
                  {contactValue}
                </a>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {sections.map((section, index) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...cardTransition, delay: 0.08 + index * 0.06 }}
              >
                <Card className="glass-panel overflow-hidden rounded-[1.6rem] border-white/10 bg-slate-950/50">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-white">{section.title}</CardTitle>
                        <CardDescription className="text-slate-300/70">
                          Documento publico da plataforma SG Esports IA.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-7 text-slate-200/85 sm:text-[0.97rem]">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets?.length ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <ul className="space-y-2 text-sm leading-7 text-slate-200/80">
                          {section.bullets.map((bullet) => (
                            <li key={bullet} className="flex gap-3">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...cardTransition, delay: 0.18 }}
            className="space-y-5"
          >
            <Card className="glass-panel rounded-[1.6rem] border-white/10 bg-slate-950/55">
              <CardHeader>
                <CardTitle className="text-lg text-white">Resumo rapido</CardTitle>
                <CardDescription className="text-slate-300/70">
                  Informacoes que a Meta e os usuarios precisam localizar sem login.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {highlights.map((item, index) => (
                  <div key={item.label}>
                    {index > 0 ? <Separator className="mb-3 bg-white/10" /> : null}
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-white/90">
                      {item.value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-panel rounded-[1.6rem] border-white/10 bg-slate-950/55">
              <CardHeader>
                <CardTitle className="text-lg text-white">Contato e solicitacoes</CardTitle>
                <CardDescription className="text-slate-300/70">
                  Canal indicado para direitos de privacidade, suporte e revisao de cadastro.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-7 text-slate-200/80">
                  Para pedidos de exclusao, correcao de dados, revisao humana ou assuntos
                  contratuais, use o canal oficial abaixo.
                </p>
                <Button asChild className="w-full bg-accent text-accent-foreground hover:opacity-95">
                  <a href={contactHref} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {contactValue}
                  </a>
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-[1.6rem] border border-white/10 bg-black/20 px-5 py-4 text-sm leading-7 text-slate-300/75 backdrop-blur">
              {footerNote}
            </div>
          </motion.aside>
        </div>
      </div>
    </main>
  );
}
