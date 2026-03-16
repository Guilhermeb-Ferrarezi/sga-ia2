import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const { user, token, refreshUser } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user || !token) return null;

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione um arquivo de imagem", variant: "error" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (max 2 MB)", variant: "error" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (avatarFile) formData.append("avatar", avatarFile);
      await api.updateProfile(token, formData);
      await refreshUser();
      setAvatarFile(null);
      toast({ title: "Perfil atualizado com sucesso", variant: "success" });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Erro ao atualizar perfil",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = avatarPreview ?? user.avatarUrl;
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-lg space-y-8 p-6">
      <div>
        <h2 className="text-xl font-bold">Meu Perfil</h2>
        <p className="text-sm text-muted-foreground">
          Altere seu nome e foto de perfil.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            className="group relative cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Avatar className="h-24 w-24 border-2 border-border text-lg">
              {displayAvatar ? (
                <AvatarImage src={displayAvatar} alt="Avatar" />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <p className="text-xs text-muted-foreground">
            Clique para alterar a foto
          </p>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="profile-name">Nome</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
          />
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={user.email} disabled />
        </div>

        {/* Role (read-only) */}
        <div className="space-y-2">
          <Label>Funcao</Label>
          <Input value={user.role} disabled />
        </div>

        <Button type="submit" disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? "Salvando..." : "Salvar alteracoes"}
        </Button>
      </form>
    </div>
  );
}
