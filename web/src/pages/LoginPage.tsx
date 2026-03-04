import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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

export default function LoginPage() {
  const { login, authLoading, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(email, password);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_20%_20%,rgba(255,127,17,0.22),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(0,128,128,0.25),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(255,204,128,0.18),transparent_40%)]" />
      <Card className="glass-panel w-full max-w-md animate-fade-up">
        <CardHeader className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            Painel Operacional
          </Badge>
          <CardTitle>Entrar no painel</CardTitle>
          <CardDescription>
            Use o usuario admin do `.env` para acessar conversas e metricas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@local.dev"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {authError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {authError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
