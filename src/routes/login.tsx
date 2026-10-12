import { useState, FormEvent } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LogoIcon } from '@/components/LogoIcon';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '/';
  const isDev = import.meta.env.DEV;

  const { isLoaded, signIn, setActive } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    setGoogleLoading(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: redirectParam,
      });
    } catch (err: any) {
      console.error('Erro ao entrar com Google:', err);
      setError(err?.errors?.[0]?.message || 'Não foi possível entrar com Google.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);

    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate(redirectParam, { replace: true });
      } else {
        console.warn('Status de login não-completo:', result.status);
        setError('Não foi possível concluir o login. Verifique seus dados.');
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      setError(clerkError?.longMessage || clerkError?.message || 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">

        {/* Logo + Nome */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoIcon size={56} />
          <h1 className="font-display text-2xl font-bold text-white">RevisaFlash</h1>
        </div>

        {/* Card */}
        <div className="w-full rounded-3xl border border-border bg-surface p-7 shadow-elevated">
          <header className="mb-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Bem-vinda de volta</h2>
            <p className="text-sm text-foreground/55 mt-1">Entre para continuar seus estudos.</p>
          </header>

          {/* Botão Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full inline-flex items-center justify-center gap-3 rounded-full border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-2/70 transition-colors disabled:opacity-50"
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continuar com Google
          </button>

          {/* Divisor */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-surface px-3 text-xs uppercase tracking-widest text-foreground/40">ou</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground/80 mb-1.5">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground/80">Senha</label>
                <Link
                  to="/reset-senha"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-full border border-border bg-background px-4 py-3 pr-12 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center text-foreground/50 hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Rodapé */}
          <p className="mt-6 text-center text-sm text-foreground/55">
            Não tem conta?{' '}
            <Link to="/cadastro" className="font-semibold text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </div>

        {isDev && (
          <span className="mt-6 rounded-full border border-border bg-surface px-3 py-1 text-[10px] uppercase tracking-widest text-foreground/40">
            dev
          </span>
        )}
      </div>
    </div>
  );
}