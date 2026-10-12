import { useState, FormEvent } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LogoIcon } from '@/components/LogoIcon';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';

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

export default function CadastroPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '/';
  const isDev = import.meta.env.DEV;

  const { isLoaded, signUp, setActive } = useSignUp();

  // Step 1 (form) vs Step 2 (verification)
  const [step, setStep] = useState<'form' | 'verification'>('form');

  // Form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verificação
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleGoogleSignup = async () => {
    if (!isLoaded || !signUp) return;
    setError(null);
    setGoogleLoading(true);
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: redirectParam,
      });
    } catch (err: any) {
      console.error('Erro ao cadastrar com Google:', err);
      setError(err?.errors?.[0]?.message || 'Não foi possível cadastrar com Google.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);

    if (!fullName.trim()) { setError('Digite seu nome completo.'); return; }
    if (!email.trim()) { setError('Digite um e-mail válido.'); return; }
    if (password.length < 8) { setError('A senha deve ter pelo menos 8 caracteres.'); return; }

    setLoading(true);
    try {
      // Divide nome completo em firstName + lastName
      const parts = fullName.trim().split(' ');
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || undefined;

      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName,
        lastName,
      });

      // Envia o código por e-mail
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      setStep('verification');
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      setError(clerkError?.longMessage || clerkError?.message || 'Erro ao criar conta. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError(null);

    if (!code.trim()) { setError('Digite o código recebido por e-mail.'); return; }

    setVerifying(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        navigate(redirectParam, { replace: true });
      } else {
        console.warn('Status de cadastro não-completo:', completeSignUp.status);
        setError('Não foi possível concluir o cadastro. Verifique o código.');
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      setError(clerkError?.longMessage || clerkError?.message || 'Código inválido ou expirado.');
    } finally {
      setVerifying(false);
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

          {step === 'form' ? (
            <>
              {/* Badge */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary mb-4">
                30 dias grátis
              </span>

              <header className="mb-6">
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Crie sua conta</h2>
                <p className="text-sm text-foreground/55 mt-1">Comece a revisar em menos de um minuto.</p>
              </header>

              {/* Botão Google */}
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={googleLoading || loading}
                className="w-full inline-flex items-center justify-center gap-3 rounded-full border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-2/70 transition-colors disabled:opacity-50"
              >
                {googleLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Cadastrar com Google
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
                  <label htmlFor="fullName" className="block text-sm font-medium text-foreground/80 mb-1.5">Nome completo</label>
                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
                  />
                </div>

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
                  <label htmlFor="password" className="block text-sm font-medium text-foreground/80 mb-1.5">Senha</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
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
                  <p className="mt-1.5 text-[11px] text-foreground/45">Mínimo de 8 caracteres.</p>
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
                      Criando conta...
                    </>
                  ) : (
                    'Criar conta'
                  )}
                </button>
              </form>

              {/* Rodapé */}
              <p className="mt-6 text-center text-sm text-foreground/55">
                Já tem conta?{' '}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          ) : (
            <>
              {/* Voltar */}
              <button
                type="button"
                onClick={() => { setStep('form'); setCode(''); setError(null); }}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/55 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </button>

              <header className="mb-6">
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Verifique seu e-mail</h2>
                <p className="text-sm text-foreground/55 mt-1">
                  Enviamos um código para <strong className="text-foreground">{email}</strong>. Digite abaixo.
                </p>
              </header>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-foreground/80 mb-1.5">Código de verificação</label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={verifying}
                    autoFocus
                    className="w-full rounded-full border border-border bg-background px-4 py-3 text-center text-lg font-mono tracking-[0.4em] text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifying || !isLoaded}
                  className="w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    'Verificar e entrar'
                  )}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-foreground/45">
                Não recebeu? Verifique a caixa de spam ou{' '}
                <button
                  type="button"
                  onClick={() => { setStep('form'); setCode(''); setError(null); }}
                  className="font-medium text-primary hover:underline"
                >
                  tente novamente
                </button>
              </p>
            </>
          )}
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