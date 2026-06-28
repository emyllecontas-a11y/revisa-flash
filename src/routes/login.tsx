// src/routes/login.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { LogoIcon } from "@/components/LogoIcon";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — RevisaFlash" },
      { name: "description", content: "Acesse sua conta no RevisaFlash." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();

  // Redireciona se já estiver logado
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate({ to: "/" });
      }
    };
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        if (password.length < 6) {
          throw new Error("A senha deve ter pelo menos 6 caracteres.");
        }
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        alert("Conta criada! Verifique seu e-mail para confirmar.");
        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: any) {
      setError(err.message || (isSignUp ? "Erro ao criar conta." : "Erro ao fazer login."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Card principal */}
        <div className="rf-card p-8">
          <div className="text-center mb-8">
            {/* 🔥 Substituído o "R" pelo LogoIcon */}
            <LogoIcon className="h-14 w-14" size={56} />
            <h1 className="mt-4 font-display text-2xl font-semibold">
              {isSignUp ? "Criar conta" : "Bem-vindo de volta"}
            </h1>
            <p className="text-sm text-foreground/55 mt-1">
              {isSignUp
                ? "Leva menos de um minuto para começar."
                : "Entre com seu e-mail e senha para continuar."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-foreground/70">Nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35"
                  placeholder="Seu nome completo"
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground/70">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35"
                placeholder="voce@exemplo.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-foreground/70">Senha</label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => alert("Funcionalidade em breve")}
                    className="text-xs text-foreground/45 hover:text-foreground transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35"
                placeholder={isSignUp ? "Mínimo 6 caracteres" : "••••••••"}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-foreground/70">Confirmar senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors placeholder:text-foreground/35"
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-accent/10 p-3 text-sm text-accent border border-accent/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading
                ? isSignUp
                  ? "Criando conta..."
                  : "Entrando..."
                : isSignUp
                ? "Criar conta"
                : "Entrar"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-foreground/45">
            {isSignUp ? (
              <>
                Já tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError("");
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Entrar
                </button>
              </>
            ) : (
              <>
                Não tem uma conta?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError("");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-primary hover:underline font-medium"
                >
                  Criar conta
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[10px] text-foreground/30">
          Ao continuar, você concorda com os Termos de Serviço e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}