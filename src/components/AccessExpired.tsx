import { Link } from "react-router-dom";
import { Clock, ArrowRight } from "lucide-react";

export function AccessExpired() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-20 w-20 rounded-full bg-accent/15 flex items-center justify-center">
            <Clock className="h-10 w-10 text-accent" />
          </div>
        </div>
        <h1 className="font-display text-2xl font-semibold text-foreground mb-2">
          Seu acesso expirou
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          O período de teste gratuito de 30 dias terminou. Para continuar estudando, você precisa renovar seu acesso.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/landing#planos"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
          >
            Renovar acesso
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}