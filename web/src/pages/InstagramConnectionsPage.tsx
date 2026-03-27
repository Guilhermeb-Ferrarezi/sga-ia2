import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ExternalLink,
  Instagram,
  Link2,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Unlink,
  Webhook,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  api,
  type InstagramConnectionSummary,
  type InstagramConnectionsOverview,
} from "@/lib/api";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const prerequisiteLabels: Array<{
  key: keyof InstagramConnectionsOverview["prerequisites"];
  label: string;
}> = [
  { key: "appIdConfigured", label: "META_APP_ID" },
  { key: "appSecretConfigured", label: "META_APP_SECRET" },
  { key: "redirectUriConfigured", label: "META_REDIRECT_URI" },
  { key: "webhookVerifyTokenConfigured", label: "META_WEBHOOK_VERIFY_TOKEN" },
];

const formatDate = (value: string | null): string =>
  value ? new Date(value).toLocaleString("pt-BR") : "Nao sincronizado ainda";

const statusTone = (status: InstagramConnectionSummary["status"]): string => {
  if (status === "CONNECTED") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "ERROR") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-200";
};

export default function InstagramConnectionsPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [overview, setOverview] = useState<InstagramConnectionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [manualConnecting, setManualConnecting] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const canManage = hasPermission(user, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);

  const loadOverview = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = await api.instagramConnections(token);
      setOverview(payload);
    } catch (error) {
      toast({
        title: "Falha ao carregar Instagram",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const status = searchParams.get("status");
    const message = searchParams.get("message");
    if (!status) return;

    toast({
      title: status === "connected" ? "Instagram conectado" : "Falha na conexao",
      description: message ?? undefined,
      variant: status === "connected" ? "success" : "error",
    });
    setSearchParams({}, { replace: true });
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const payload = await api.instagramConnectUrl(token);
      window.location.href = payload.url;
    } catch (error) {
      toast({
        title: "Nao foi possivel iniciar a conexao",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connection: InstagramConnectionSummary) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Desconectar @${connection.instagramUsername ?? connection.pageName}?`,
    );
    if (!confirmed) return;

    setDisconnectingId(connection.id);
    try {
      await api.deleteInstagramConnection(token, connection.id);
      toast({
        title: "Conexao removida",
        description: "A conta do Instagram foi desconectada do painel.",
        variant: "success",
      });
      await loadOverview();
    } catch (error) {
      toast({
        title: "Falha ao remover conexao",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleManualConnect = async () => {
    if (!token) return;

    const accessToken = manualToken.trim();
    if (!accessToken) {
      toast({
        title: "Cole um token primeiro",
        description: "Use um user access token da Meta que consiga listar a Page no /me/accounts.",
        variant: "error",
      });
      return;
    }

    setManualConnecting(true);
    try {
      const payload = await api.connectInstagramWithToken(token, { accessToken });
      setManualToken("");
      toast({
        title: "Instagram conectado",
        description: payload.message,
        variant: "success",
      });
      await loadOverview();
    } catch (error) {
      toast({
        title: "Falha ao conectar por token",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setManualConnecting(false);
    }
  };

  if (!token) return null;

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Meta Channels
          </p>
          <h2 className="text-2xl font-bold">Instagram</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Conecte a conta profissional, valide o webhook da Meta e reutilize a
            mesma triagem do bot para DM no Instagram.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void loadOverview()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Atualizar
          </Button>
          {canManage && (
            <Button type="button" onClick={() => void handleConnect()} disabled={connecting || loading}>
              <Instagram className="h-4 w-4" />
              {connecting ? "Abrindo Meta..." : "Conectar Instagram"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
        >
          <Card className="overflow-hidden">
            <div className="h-28 bg-[radial-gradient(circle_at_top_left,_rgba(244,114,182,0.28),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.26),_transparent_38%),linear-gradient(135deg,rgba(10,14,24,0.98),rgba(24,24,44,0.94))]" />
            <CardContent className="-mt-10 space-y-5 pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/20 backdrop-blur">
                    <Instagram className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Painel de conexao</h3>
                    <p className="text-sm text-muted-foreground">
                      OAuth oficial da Meta, webhook em tempo real e envio direto pela
                      Graph API.
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    overview?.appConfigured
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  }
                >
                  {overview?.appConfigured ? "Config pronta" : "Config pendente"}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {prerequisiteLabels.map((item) => {
                  const ready = overview?.prerequisites[item.key] ?? false;
                  return (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{item.label}</span>
                        <Badge
                          variant="outline"
                          className={
                            ready
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                          }
                        >
                          {ready ? "OK" : "Falta"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Webhook className="h-4 w-4 text-primary" />
                    Webhook
                  </div>
                  <p className="break-all text-sm text-muted-foreground">
                    {overview ? `${window.location.origin}${overview.webhookPath}` : "Carregando..."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Link2 className="h-4 w-4 text-primary" />
                    Callback OAuth
                  </div>
                  <p className="break-all text-sm text-muted-foreground">
                    {overview?.callbackUrl ?? "Defina META_REDIRECT_URI"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Escopos pedidos no login
                </div>
                <div className="flex flex-wrap gap-2">
                  {(overview?.requiredScopes ?? []).map((scope) => (
                    <Badge key={scope} variant="secondary" className="font-normal">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
        >
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LockKeyhole className="h-4 w-4 text-primary" />
                  Conectar por Access Token
                </CardTitle>
                <CardDescription>
                  Use um token do Instagram Login ou um token da Meta para fechar a conexao sem depender do popup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="instagram-manual-token">Token da Meta</Label>
                  <Textarea
                    id="instagram-manual-token"
                    value={manualToken}
                    onChange={(event) => setManualToken(event.target.value)}
                    placeholder="Cole aqui o access token do Instagram/Meta"
                    className="min-h-[132px] font-mono text-xs"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
                  Aceita token direto do Instagram Login via <code>graph.instagram.com/me</code> ou token legado que resolva a Page via <code>/me/accounts</code>.
                </div>
                <Button
                  type="button"
                  onClick={() => void handleManualConnect()}
                  disabled={manualConnecting || !manualToken.trim()}
                  className="w-full"
                >
                  <Instagram className="h-4 w-4" />
                  {manualConnecting ? "Conectando..." : "Conectar via token"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-primary" />
                Passos fora do codigo
              </CardTitle>
              <CardDescription>
                O Instagram precisa de alguns itens manuais dentro da Meta e da propria conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                1. Conta Instagram precisa ser Professional.
              </div>
              <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                2. Para Instagram Login nao precisa Facebook Page. Para o fluxo legado via Messenger, precisa.
              </div>
              <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                3. Ative Connected Tools no Instagram para liberar mensagens.
              </div>
              <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                4. Em producao, a Meta vai exigir App Review.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado atual</CardTitle>
              <CardDescription>
                {overview?.connections.length
                  ? `${overview.connections.length} conexao(oes) carregadas.`
                  : "Nenhuma conexao ativa ainda."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Graph version</span>
                <Badge variant="outline">{overview?.graphVersion ?? "..."}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">OAuth</span>
                <Badge
                  variant="outline"
                  className={
                    overview?.appConfigured
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  }
                >
                  {overview?.appConfigured ? "Disponivel" : "Pendente"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
      >
        <Card>
          <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Contas conectadas</CardTitle>
              <CardDescription>
                Contas prontas para receber DM no Instagram e responder direto do painel.
              </CardDescription>
            </div>
            {!canManage && (
              <Badge variant="outline" className="w-fit">
                Acesso somente leitura
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                Carregando status do Instagram...
              </div>
            ) : !overview || overview.connections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta conectada ainda.
                </p>
                {canManage && (
                  <Button
                    type="button"
                    className="mt-4"
                    onClick={() => void handleConnect()}
                    disabled={connecting}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Iniciar login com Instagram
                  </Button>
                )}
              </div>
            ) : (
              overview.connections.map((connection, index) => (
                <motion.div
                  key={connection.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + index * 0.05, duration: 0.28 }}
                  className="rounded-2xl border border-border/60 bg-background/50 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">
                          {connection.instagramUsername
                            ? `@${connection.instagramUsername}`
                            : connection.pageName}
                        </h3>
                        <Badge variant="outline" className={statusTone(connection.status)}>
                          {connection.status}
                        </Badge>
                        <Badge variant="outline">
                          {connection.connectionMode === "INSTAGRAM_LOGIN"
                            ? "Instagram Login"
                            : "Messenger/Page"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            connection.webhookSubscribed
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                          }
                        >
                          {connection.webhookSubscribed ? "Webhook ativo" : "Webhook pendente"}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                        <p>
                          Origem:{" "}
                          {connection.connectionMode === "INSTAGRAM_LOGIN"
                            ? "Conta direta do Instagram"
                            : "Facebook Page vinculada"}
                        </p>
                        <p>
                          {connection.connectionMode === "INSTAGRAM_LOGIN"
                            ? "IG Login ID"
                            : "Page ID"}
                          : {connection.pageId}
                        </p>
                        <p>Instagram ID: {connection.instagramAccountId}</p>
                        <p>Contatos ligados: {connection.contactsCount}</p>
                        <p>Sincronizado: {formatDate(connection.lastSyncedAt)}</p>
                        <p>Atualizado: {formatDate(connection.updatedAt)}</p>
                      </div>
                    </div>

                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleDisconnect(connection)}
                        disabled={disconnectingId === connection.id}
                      >
                        <Unlink className="h-4 w-4" />
                        {disconnectingId === connection.id ? "Removendo..." : "Desconectar"}
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
