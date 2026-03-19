import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import {
  ImagePlus,
  RefreshCcw,
  Save,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  api,
  type UpdateWhatsAppProfileInput,
  type WhatsAppProfileSummary,
} from "@/lib/api";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  websites: string;
};

const emptyForm: FormState = {
  about: "",
  address: "",
  description: "",
  email: "",
  vertical: "",
  websites: "",
};

const toFormState = (profile: WhatsAppProfileSummary): FormState => ({
  about: profile.profile.about ?? "",
  address: profile.profile.address ?? "",
  description: profile.profile.description ?? "",
  email: profile.profile.email ?? "",
  vertical: profile.profile.vertical ?? "",
  websites: profile.profile.websites.join("\n"),
});

const makeInitials = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) return "WA";

  const initials = normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || normalized.slice(0, 2).toUpperCase();
};

const formatMetaValue = (value: string | null | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) return "Nao informado";

  return normalized
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const toneForStatus = (value: string | null | undefined): string => {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return "border-border/70 bg-background/70 text-muted-foreground";
  }

  if (["APPROVED", "AVAILABLE", "GREEN", "HIGH", "CONNECTED"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }

  if (["PENDING", "IN_REVIEW", "YELLOW", "MEDIUM"].includes(normalized)) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }

  if (["REJECTED", "RED", "LOW", "EXPIRED"].includes(normalized)) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }

  return "border-border/70 bg-background/70 text-foreground";
};

export default function WhatsAppProfilePage() {
  const { token, logout, user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<WhatsAppProfileSummary | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const canManageProfile = hasPermission(user, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const data = await api.whatsappProfile(token);
      setProfile(data);
      setForm(toFormState(data));
      setPhotoFile(null);
      setPhotoInputKey((current) => current + 1);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
        return;
      }

      setError(err instanceof Error ? err.message : "Falha ao carregar perfil do WhatsApp");
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  const handleChange =
    (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPhotoFile(file);
  };

  const handleSave = async () => {
    if (!token || !profile) return;

    const input: UpdateWhatsAppProfileInput = {
      about: form.about.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      email: form.email.trim(),
      vertical: form.vertical.trim(),
      websites: form.websites
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      profilePhoto: photoFile,
    };

    setSaving(true);
    try {
      const updated = await api.updateWhatsAppProfile(token, input);
      setProfile(updated);
      setForm(toFormState(updated));
      setPhotoFile(null);
      setPhotoInputKey((current) => current + 1);
      setError(null);
      toast({
        title: "Perfil do WhatsApp atualizado",
        description: "As alteracoes suportadas pela Meta foram salvas.",
        variant: "success",
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
        return;
      }

      const message =
        err instanceof Error ? err.message : "Nao foi possivel salvar o perfil";
      setError(message);
      toast({
        title: "Falha ao salvar perfil",
        description: message,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const canEdit = Boolean(
    profile?.capabilities.canEditBusinessProfile ?? canManageProfile,
  );
  const photoSrc = photoPreviewUrl ?? profile?.profile.profilePictureUrl ?? undefined;
  const displayName = profile?.phoneNumber.verifiedName ?? "Conta conectada";
  const displayPhone = profile?.phoneNumber.displayPhoneNumber ?? "Numero nao informado";

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Perfil WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            Altere foto e dados publicos do perfil comercial conectado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canEdit || loading || saving || !profile}
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar perfil"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && !profile ? (
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-3 animate-pulse">
              <div className="h-24 rounded-xl bg-muted/50" />
              <div className="h-20 w-20 rounded-full bg-muted/50" />
              <div className="h-5 w-2/3 rounded-md bg-muted/50" />
              <div className="h-4 w-1/2 rounded-md bg-muted/50" />
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-2 animate-pulse">
              <div className="h-5 w-1/3 rounded-md bg-muted/50" />
              <div className="h-4 w-full rounded-md bg-muted/50" />
              <div className="h-4 w-4/5 rounded-md bg-muted/50" />
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card/50 p-6 space-y-3 animate-pulse">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="h-4 w-28 rounded-md bg-muted/50" />
                <div className="h-10 rounded-md bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
      ) : profile ? (
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="h-24 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.35),_transparent_55%),linear-gradient(135deg,rgba(8,14,24,0.96),rgba(16,24,40,0.9))]" />
              <CardContent className="-mt-10 space-y-4 pt-0">
                <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                  <AvatarImage src={photoSrc} alt={displayName} />
                  <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                    {makeInitials(displayName)}
                  </AvatarFallback>
                </Avatar>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <Smartphone className="h-3.5 w-3.5" />
                    Conta conectada
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{displayName}</h3>
                    <p className="text-sm text-muted-foreground">{displayPhone}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={toneForStatus(profile.phoneNumber.qualityRating)}>
                      Qualidade: {formatMetaValue(profile.phoneNumber.qualityRating)}
                    </Badge>
                    <Badge variant="outline" className={toneForStatus(profile.phoneNumber.nameStatus)}>
                      Nome: {formatMetaValue(profile.phoneNumber.nameStatus)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profilePhoto" className="flex items-center gap-2">
                    <ImagePlus className="h-4 w-4 text-primary" />
                    Nova foto do perfil
                  </Label>
                  <Input
                    key={photoInputKey}
                    id="profilePhoto"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    disabled={!canEdit || saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    A Meta valida formato, tamanho e proporcao da imagem no envio.
                  </p>
                  {photoFile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPhotoFile(null);
                        setPhotoInputKey((current) => current + 1);
                      }}
                      disabled={saving}
                    >
                      Remover nova foto
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Limites da Cloud API</CardTitle>
                <CardDescription>
                  Alguns itens da conta conectada nao podem ser alterados por este painel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert className="h-4 w-4 text-amber-300" />
                    Nome de exibicao
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {profile.limitations.displayName}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert className="h-4 w-4 text-amber-300" />
                    Banner ou capa
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {profile.limitations.banner}
                  </p>
                </div>
                {!canEdit && (
                  <p className="text-xs text-muted-foreground">
                    Seu cargo pode visualizar, mas nao salvar alteracoes desse perfil.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Dados publicos do perfil</CardTitle>
              <CardDescription>
                Estes campos refletem o perfil comercial exibido no WhatsApp quando suportados pela Meta.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="about">Sobre</Label>
                <Input
                  id="about"
                  value={form.about}
                  onChange={handleChange("about")}
                  placeholder="Ex: Atendimento oficial SGA"
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vertical">Categoria</Label>
                <Input
                  id="vertical"
                  value={form.vertical}
                  onChange={handleChange("vertical")}
                  placeholder="Ex: ENTERTAINMENT"
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Descricao</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={handleChange("description")}
                  placeholder="Descreva a operacao, servicos ou contexto da conta."
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="contato@suaempresa.com"
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Endereco</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={handleChange("address")}
                  placeholder="Cidade, estado ou endereco comercial"
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="websites">Sites</Label>
                <Textarea
                  id="websites"
                  value={form.websites}
                  onChange={handleChange("websites")}
                  placeholder={"https://seusite.com\nhttps://instagram.com/sua_marca"}
                  disabled={!canEdit || saving}
                />
                <p className="text-xs text-muted-foreground">
                  Informe um link por linha.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Nao foi possivel carregar o perfil da conta conectada.
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
