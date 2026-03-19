import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AccessDeniedProps {
  title?: string;
  description?: string;
}

export default function AccessDenied({
  title = "Acesso restrito",
  description = "Seu cargo nao possui permissao para acessar este modulo.",
}: AccessDeniedProps) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="glass-panel border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Se precisar desse acesso, ajuste o cargo do usuario ou a matriz de permissoes.
        </CardContent>
      </Card>
    </div>
  );
}
