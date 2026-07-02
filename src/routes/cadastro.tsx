import { SignUp } from '@clerk/clerk-react'; // <-- CORRIGIDO
import { useSearchParams } from 'react-router-dom';
import { LogoIcon } from '@/components/LogoIcon';

export default function CadastroPage() {
  const isDev = import.meta.env.DEV;
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  // Define o destino após cadastro: usa o parâmetro 'redirect' se existir, senão vai para '/'
  const afterSignUpUrl = redirectParam || '/';

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Logo + Nome RevisaFlash */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoIcon size={56} />
          <h1 className="font-display text-2xl font-semibold text-white">RevisaFlash</h1>
        </div>
        <SignUp
          routing="path"
          path="/cadastro"
          signInUrl="/login"
          afterSignUpUrl={afterSignUpUrl}
          appearance={{
            variables: {
              colorPrimary: '#14B8A6',
              colorBackground: '#0F1A1F',
              colorText: '#FFFFFF',
              colorTextSecondary: '#C0C0D0',
              borderRadius: '0.75rem',
              fontFamily: 'DM Sans, sans-serif',
            },
            elements: {
              card: 'background: #1A2A30; border: 1px solid rgba(255,255,255,0.1); border-radius: 1rem; padding: 2rem; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);',
              header: 'display: none;',
              headerTitle: 'display: none;',
              headerSubtitle: 'display: none;',
              formButtonPrimary: 'background: #14B8A6; color: #FFFFFF; font-weight: 600; padding: 0.625rem; width: 100%; border-radius: 0.5rem; transition: all 0.2s; border: none; cursor: pointer; font-size: 0.875rem;',
              formButtonPrimary__hover: 'background: #0ea596;',
              formFieldInput: 'background: #0F1A1F; border: 1px solid #2A3A40; padding: 0.625rem; border-radius: 0.5rem; color: #FFFFFF !important; width: 100%; outline: none; transition: all 0.2s; font-size: 0.875rem;',
              formFieldInput__focus: 'border-color: #14B8A6;',
              formFieldLabel: 'color: #FFFFFF !important; font-size: 0.875rem; font-weight: 500; display: block; margin-bottom: 0.25rem;',
              identityPreview: 'color: #FFFFFF;',
              socialButtonsBlockButton: 'border: 1px solid #2A3A40; background: #1A2A30; border-radius: 0.5rem; color: #FFFFFF !important; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; padding: 0.5rem; width: 100%;',
              socialButtonsBlockButton__hover: 'background: #2A3A40;',
              socialButtonsBlockButtonText: 'color: #FFFFFF !important;',
              footerActionLink: 'color: #14B8A6 !important; text-decoration: underline; font-weight: 500; font-size: 0.875rem;',
              footerActionLink__hover: 'color: #0ea596 !important;',
              formFieldErrorText: 'color: #E53E3E; font-size: 0.75rem; margin-top: 0.25rem;',
              dividerLine: 'background: #2A3A40; height: 1px;',
              dividerText: 'color: #8A86A8; font-size: 0.75rem; padding: 0 0.5rem;',
              formFieldHintText: 'color: #8A86A8; font-size: 0.75rem;',
              footer: 'color: #8A86A8; font-size: 0.75rem; margin-top: 1rem; text-align: center;',
            },
          }}
        />
      </div>
      {isDev && (
        <span className="absolute bottom-4 right-4 rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#8A86A8]">
          dev
        </span>
      )}
    </div>
  );
}