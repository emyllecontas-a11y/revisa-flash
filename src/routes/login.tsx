import { useState, useEffect, FormEvent } from 'react';
import { useSignIn } from '@clerk/react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { LogoIcon } from '@/components/LogoIcon';
import { Eye, EyeOff, Loader2, Mail, ArrowLeft, AlertCircle } from 'lucide-react';

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

  const { isLoaded: clerkIsLoaded, signIn, setActive } = useSignIn();
  const [forcedLoaded, setForcedLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForcedLoaded(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const isLoaded = clerkIsLoaded || forcedLoaded;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para segundo fator (Device Trust / MFA)
  const [step, setStep] = useState<'password' | 'second_factor'>('password');
  const [secondFactorCode, setSecondFactorCode] = useState('');
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<'email_code'>('email_code');
  const [codeSent, setCodeSent] = useState(false);
  const [secondFactorLoading, setSecondFactorLoading] = useState(false);

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
      console.error('Clerk Google error details:', JSON.stringify(err, null, 2));
      setError(err?.errors?.[0]?.message || 'Não foi possível entrar com Google.');
      setGoogleLoading(false);
    }
  };

  // Handler para o primeiro fator (senha)
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
      // Clerk v6 headless flow:
      // 1. create({ identifier }) — inicia o sign-in
      // 2. selectFirstFactor('password') — seleciona password como fator
      // 3. password({ password }) — verifica a senha
      // 4. Se status === 'complete', finalize() cria a sessão
      // 5. Se status === 'needs_client_trust' ou 'needs_second_factor', preparar segundo fator
      console.log('=== CLERK SIGNIN: Iniciando create ===');
      const createResult = await signIn.create({
        identifier: email.trim(),
      });
      console.log('create result:', createResult);
      console.log('signIn.status after create:', signIn?.status);
      console.log('signIn.firstFactorVerification after create:', signIn?.firstFactorVerification);

      console.log('=== CLERK SIGNIN: Selecionando fator password ===');
      const selectFactorResult = await signIn.selectFirstFactor('password');
      console.log('selectFirstFactor result:', selectFactorResult);
      console.log('signIn.status after selectFirstFactor:', signIn?.status);
      console.log('signIn.firstFactorVerification after selectFirstFactor:', signIn?.firstFactorVerification);

      console.log('=== CLERK SIGNIN: Verificando password ===');
      const passwordResult = await signIn.password({
        password,
      });
      console.log('password result:', passwordResult);
      console.log('signIn.status after password:', signIn?.status);
      console.log('signIn.firstFactorVerification after password:', signIn?.firstFactorVerification);

      // Se status for 'complete', finaliza direto
      if (signIn?.status === 'complete') {
        console.log('=== CLERK SIGNIN: Finalizando (status complete) ===');
        const finalizeResult = await signIn.finalize();
        console.log('finalize result:', finalizeResult);
        console.log('finalizeResult.status:', finalizeResult?.status);
        console.log('finalizeResult.createdSessionId:', finalizeResult?.createdSessionId);

        if (finalizeResult.status === 'complete') {
          await setActive({ session: finalizeResult.createdSessionId });
          navigate(redirectParam, { replace: true });
          return;
        }
      }

      // Status 'needs_client_trust' = Device Trust (dispositivo novo/desconhecido)
      // Status 'needs_second_factor' = MFA do usuário (2FA habilitado)
      // Ambos exigem segundo fator. O Clerk v6 expõe supportedSecondFactors no secondFactorVerification.
      if (signIn?.status === 'needs_client_trust' || signIn?.status === 'needs_second_factor') {
        console.log(`=== CLERK SIGNIN: Status ${signIn?.status} — preparando segundo fator ===`);
        console.log('signIn.secondFactorVerification:', signIn?.secondFactorVerification);

        // Verifica quais fatores de segundo fator estão disponíveis
        const supportedFactors = signIn?.secondFactorVerification?.supportedSecondFactors || [];
        console.log('Supported second factors:', supportedFactors);

        // Preferir email_code se disponível (Device Trust usa email_code por padrão)
        const hasEmailCode = supportedFactors.includes('email_code');
        const hasPhoneCode = supportedFactors.includes('phone_code');
        const hasAuthenticator = supportedFactors.includes('totp');

        let chosenStrategy: 'email_code' | 'phone_code' | 'totp' = 'email_code';
        if (hasEmailCode) chosenStrategy = 'email_code';
        else if (hasPhoneCode) chosenStrategy = 'phone_code';
        else if (hasAuthenticator) chosenStrategy = 'totp';

        setSecondFactorStrategy(chosenStrategy);

        // Prepara o segundo fator (envia o código)
        console.log(`=== CLERK SIGNIN: Preparando segundo fator (${chosenStrategy}) ===`);
        const prepareResult = await signIn.prepareSecondFactor({ strategy: chosenStrategy });
        console.log('prepareSecondFactor result:', prepareResult);

        setCodeSent(true);
        setStep('second_factor');
        return;
      }

      // Outros status não-completos
      console.warn('Status de login não-completo:', signIn?.status);
      console.warn('signIn completo para debug:', JSON.stringify(signIn, null, 2));
      setError(`Não foi possível concluir o login (Status: ${signIn?.status || 'desconhecido'}).`);
    } catch (err: any) {
      console.error('=== ERRO CLERK LOGIN ===');
      console.error('Erro completo:', err);
      console.error('Erro stringificado:', JSON.stringify(err, null, 2));
      console.error('err.errors:', err?.errors);
      console.error('err.message:', err?.message);
      console.error('err.code:', err?.code);
      console.error('err.status:', err?.status);
      // Try to get response body if it's a fetch error
      if (err?.response) {
        console.error('Clerk response status:', err.response.status);
        try {
          const responseText = await err.response.text();
          console.error('Clerk response body:', responseText);
        } catch (e) {
          console.error('Falha ao ler response body:', e);
        }
      }
      if (err?.cause) {
        console.error('Clerk cause:', err.cause);
      }

      // Verifica erros específicos do Clerk v6
      const clerkErrors = err?.errors;
      if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
        const firstError = clerkErrors[0];
        console.error('Clerk error code:', firstError?.code);
        console.error('Clerk error meta:', firstError?.meta);
        console.error('Clerk error longMessage:', firstError?.longMessage);

        // Códigos comuns que indicam configuração faltando
        const configCodes = [
          'form_password_not_enabled',
          'form_identifier_not_enabled',
          'form_identifier_verification_required',
          'form_email_not_verified',
        ];

        if (configCodes.includes(firstError?.code)) {
          const msg = `Configuração necessária no painel do Clerk: ${firstError.longMessage || firstError.message}`;
          console.error('⚠️ PROBLEMA DE CONFIGURAÇÃO:', msg);
          setError(msg);
          return;
        }
      }

      const clerkError = err?.errors?.[0];
      const errorMsg = clerkError?.longMessage || clerkError?.message || err?.message || 'E-mail ou senha incorretos.';
      console.error('Mensagem final para usuário:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handler para o segundo fator (código por e-mail/telefone/TOTP)
  const handleSecondFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError(null);

    if (!secondFactorCode.trim()) {
      setError('Digite o código recebido.');
      return;
    }

    setSecondFactorLoading(true);
    try {
      console.log('=== CLERK SIGNIN: Tentando segundo fator ===', { strategy: secondFactorStrategy, code: secondFactorCode.trim() });
      const attemptResult = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: secondFactorCode.trim(),
      });
      console.log('attemptSecondFactor result:', attemptResult);
      console.log('signIn.status after attemptSecondFactor:', signIn?.status);
      console.log('signIn.secondFactorVerification after attemptSecondFactor:', signIn?.secondFactorVerification);

      // Se o segundo fator foi verificado com sucesso, finaliza a sessão
      if (signIn?.status === 'complete') {
        console.log('=== CLERK SIGNIN: Finalizando após segundo fator ===');
        const finalizeResult = await signIn.finalize();
        console.log('finalize result:', finalizeResult);
        console.log('finalizeResult.status:', finalizeResult?.status);
        console.log('finalizeResult.createdSessionId:', finalizeResult?.createdSessionId);

        if (finalizeResult.status === 'complete') {
          await setActive({ session: finalizeResult.createdSessionId });
          navigate(redirectParam, { replace: true });
          return;
        }
      }

      // Se ainda precisa de segundo fator (ex: código errado, expirou, ou precisa de outro fator)
      if (signIn?.status === 'needs_second_factor' || signIn?.status === 'needs_client_trust') {
        console.warn('Segundo fator ainda necessário após tentativa:', signIn?.status);
        console.warn('signIn.secondFactorVerification:', signIn?.secondFactorVerification);
        
        // Verifica se houve erro específico no segundo fator
        const secondFactorError = signIn?.secondFactorVerification?.error;
        if (secondFactorError) {
          console.error('Erro no segundo fator:', secondFactorError);
          if (secondFactorError.code === 'form_code_incorrect' || secondFactorError.code === 'form_code_expired') {
            setError('Código incorreto ou expirado. Tente novamente.');
            setSecondFactorCode('');
            setSecondFactorLoading(false);
            return;
          }
        }
        
        setError('Não foi possível verificar o código. Tente novamente.');
        setSecondFactorCode('');
        return;
      }

      // Outros status não-completos
      console.warn('Status não-completo após segundo fator:', signIn?.status);
      setError(`Não foi possível concluir o login (Status: ${signIn?.status || 'desconhecido'}).`);
    } catch (err: any) {
      console.error('=== ERRO CLERK SEGUNDO FATOR ===');
      console.error('Erro completo:', err);
      console.error('Erro stringificado:', JSON.stringify(err, null, 2));
      console.error('err.errors:', err?.errors);

      const clerkError = err?.errors?.[0];
      const errorCode = clerkError?.code;
      const errorMsg = clerkError?.longMessage || clerkError?.message || err?.message || 'Erro ao verificar código.';

      // Tratamento específico de erros de código
      if (errorCode === 'form_code_incorrect' || errorCode === 'form_code_expired') {
        setError('Código incorreto ou expirado. Verifique seu e-mail e tente novamente.');
      } else if (errorCode === 'form_code_not_found') {
        setError('Código não encontrado. Solicite um novo código.');
        setCodeSent(false);
      } else {
        setError(errorMsg);
      }
    } finally {
      setSecondFactorLoading(false);
    }
  };

  // Reenviar código do segundo fator
  const handleResendCode = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    setSecondFactorLoading(true);
    try {
      console.log('=== CLERK SIGNIN: Reenviando código do segundo fator ===', { strategy: secondFactorStrategy });
      const prepareResult = await signIn.prepareSecondFactor({ strategy: secondFactorStrategy });
      console.log('prepareSecondFactor (resend) result:', prepareResult);
      setCodeSent(true);
      setError(null);
    } catch (err: any) {
      console.error('Erro ao reenviar código:', err);
      const clerkError = err?.errors?.[0];
      setError(clerkError?.longMessage || clerkError?.message || 'Erro ao reenviar código.');
    } finally {
      setSecondFactorLoading(false);
    }
  };

  // Voltar para etapa de senha
  const handleBackToPassword = () => {
    setStep('password');
    setSecondFactorCode('');
    setCodeSent(false);
    setError(null);
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

          {/* Form - Etapa 1: Senha */}
          {step === 'password' && (
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
          )}

          {/* Form - Etapa 2: Segundo Fator (Device Trust / MFA) */}
          {step === 'second_factor' && (
            <div className="space-y-4">
              {/* Botão voltar */}
              <button
                type="button"
                onClick={handleBackToPassword}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/55 hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </button>

              <header className="mb-4">
                <h3 className="font-display text-xl font-bold tracking-tight text-foreground">Verificação de segurança</h3>
                <p className="text-sm text-foreground/55 mt-1">
                  {secondFactorStrategy === 'email_code' && (
                    <>
                      Enviamos um código de verificação para <strong className="text-foreground">{email}</strong>.
                    </>
                  )}
                  {secondFactorStrategy === 'phone_code' && (
                    <>
                      Enviamos um código de verificação por SMS.
                    </>
                  )}
                  {secondFactorStrategy === 'totp' && (
                    <>
                      Digite o código do seu aplicativo autenticador.
                    </>
                  )}
                </p>
              </header>

              <form onSubmit={handleSecondFactorSubmit} className="space-y-4">
                <div>
                  <label htmlFor="secondFactorCode" className="block text-sm font-medium text-foreground/80 mb-1.5">
                    {secondFactorStrategy === 'totp' ? 'Código do autenticador' : 'Código de verificação'}
                  </label>
                  <input
                    id="secondFactorCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={secondFactorStrategy === 'totp' ? '000000' : '000000'}
                    value={secondFactorCode}
                    onChange={(e) => setSecondFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={secondFactorLoading}
                    autoFocus
                    className="w-full rounded-full border border-border bg-background px-4 py-3 text-center text-lg font-mono tracking-[0.4em] text-foreground outline-none focus:border-primary placeholder:text-foreground/35"
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={secondFactorLoading || !isLoaded}
                  className="w-full rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {secondFactorLoading ? (
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
                Não recebeu o código?{' '}
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={secondFactorLoading}
                  className="font-medium text-primary hover:underline disabled:opacity-50"
                >
                  Reenviar código
                </button>
              </p>
            </div>
          )}

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