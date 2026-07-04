import { Link } from "react-router-dom";
import {
  Zap,
  BookOpen,
  Target,
  Flame,
  Brain,
  Calendar as CalendarIcon,
  BarChart3,
  Layers,
  Smartphone,
  Check,
  ArrowRight,
  Sparkles,
  ClipboardList,
  RefreshCcw,
  Menu,
  X,
  Apple,
  Chrome,
} from "lucide-react";
import { useState } from "react";
import { useAppUser } from "@/contexts/UserContext"; // <-- ALTERADO

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isSignedIn } = useAppUser(); // <-- ALTERADO

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <BackgroundFX />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <Zap className="h-5 w-5 text-primary" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Revisa<span className="text-primary">Flash</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#inicio" className="text-sm text-muted-foreground hover:text-foreground transition">Início</a>
            <a href="#funcionalidades" className="text-sm text-muted-foreground hover:text-foreground transition">Funcionalidades</a>
            <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground transition">Como funciona</a>
            <a href="#planos" className="text-sm text-muted-foreground hover:text-foreground transition">Planos</a>
            <a href="#instalar" className="text-sm text-muted-foreground hover:text-foreground transition">Instalar</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isSignedIn ? (
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition">
                Ir para o app
              </Link>
            ) : (
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition">
                Entrar
              </Link>
            )}
            <Link
              to="/cadastro"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_-10px_rgba(20,184,166,0.6)] hover:bg-primary/90 transition"
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            className="md:hidden grid h-9 w-9 place-items-center rounded-md border border-border"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-border/60 px-6 py-4 space-y-3 bg-background/95">
            {[
              ["Início", "#inicio"],
              ["Funcionalidades", "#funcionalidades"],
              ["Como funciona", "#como-funciona"],
              ["Planos", "#planos"],
              ["Instalar", "#instalar"],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block text-sm text-muted-foreground">
                {label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              {isSignedIn ? (
                <Link to="/" className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">
                  Ir para o app
                </Link>
              ) : (
                <>
                  <Link to="/login" className="flex-1 rounded-md border border-border px-3 py-2 text-center text-sm">
                    Entrar
                  </Link>
                  <Link to="/cadastro" className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground">
                    Testar grátis
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* Hero */}
        <section id="inicio" className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="rf-fade-in">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Teste grátis por 30 dias — sem cartão
              </span>

              <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
                Estude com inteligência.
                <br />
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                  Passe com confiança.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
                O RevisaFlash combina flashcards com repetição espaçada (FSRS), banco de erros
                automático e estatísticas para você dominar o conteúdo da residência com o menor
                esforço possível.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/cadastro"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_20px_50px_-16px_rgba(20,184,166,0.7)] hover:bg-primary/90 transition"
                >
                  Teste grátis por 30 dias
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#funcionalidades"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-6 py-3 text-sm font-medium hover:bg-muted transition"
                >
                  Ver funcionalidades
                </a>
              </div>

              <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
                {[
                  { k: "FSRS", v: "Algoritmo científico" },
                  { k: "DSM30", v: "Revisões 5 níveis" },
                  { k: "PWA", v: "Offline & instalável" },
                ].map((s) => (
                  <div key={s.k}>
                    <div className="font-display text-xl text-primary">{s.k}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <HeroMockup />
          </div>
        </section>

        {/* Funcionalidades */}
        <section id="funcionalidades" className="mx-auto max-w-7xl px-6 py-20">
          <SectionHeader
            kicker="Funcionalidades"
            title="Tudo que você precisa para estudar melhor"
            subtitle="Sete pilares integrados para transformar cada minuto de estudo em progresso real."
          />

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Brain className="h-5 w-5" />}
              title="Flashcards com FSRS"
              badge="Repetição espaçada científica"
            >
              O <b>FSRS</b> (Free Spaced Repetition Schedule) modela sua memória com três variáveis: <b>dificuldade</b>,{" "}
              <b>estabilidade</b> e <b>recordação</b>. Ao avaliar cada card (Errei, Difícil, Bom, Fácil), o algoritmo
              recalcula quando você deve revisá-lo novamente para atingir 90% de retenção — cada card com sua própria
              curva, adaptada ao seu ritmo.
            </FeatureCard>

            <FeatureCard
              icon={<Target className="h-5 w-5" />}
              title="Banco de erros automático"
              badge="Zero trabalho manual"
              accent
            >
              Registre a questão que errou, o tipo de erro (conceito, interpretação, memória, atenção) e a grande área.
              O app <b>gera automaticamente um flashcard</b> no deck "Erros" que entra na sua fila FSRS. Estatísticas de
              reincidência mostram exatamente onde focar.
            </FeatureCard>

            <FeatureCard
              icon={<BookOpen className="h-5 w-5" />}
              title="Plano de estudos com anexos"
              badge="Materiais organizados"
            >
              Estruture disciplinas e tópicos com status (Não iniciado → Estudando → Revisado → Dominado). Faça upload
              de PDFs, imagens, planilhas e áudios diretamente no tópico. Tudo sincronizado entre dispositivos, acessível
              com um clique.
            </FeatureCard>

            <FeatureCard
              icon={<CalendarIcon className="h-5 w-5" />}
              title="Calendário e revisões DSM30"
              badge="5 níveis automáticos"
            >
              Ao concluir um tópico, o app agenda 5 revisões: <b>1, 7, 15, 30 e 60 dias</b>. As revisões aparecem no
              calendário como eventos e avançam de nível automaticamente conforme você as completa, até o tópico ser
              considerado <b>dominado</b>.
            </FeatureCard>

            <FeatureCard
              icon={<ClipboardList className="h-5 w-5" />}
              title="Dashboard e checklist diário"
              badge="Visão instantânea"
            >
              Streak, flashcards do dia, erros ativos e contagem regressiva para a prova em uma tela. Crie um checklist
              personalizado que reinicia a cada dia e acompanhe o progresso por disciplina em tempo real.
            </FeatureCard>

            <FeatureCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Desempenho detalhado"
              badge="Métricas que evoluem"
            >
              Acertos gerais, cards revisados, horas de estudo, questões resolvidas, heatmap de intensidade, ranking de
              áreas com mais erros e evolução semanal de acertos — tudo em um só lugar.
            </FeatureCard>

            <FeatureCard
              icon={<Smartphone className="h-5 w-5" />}
              title="Offline & PWA"
              badge="Instale como app nativo"
            >
              Instale na tela inicial do celular, funcione sem internet e sincronize automaticamente quando voltar online.
              Ícone próprio, splash screen e atualizações automáticas — sem passar pela loja.
            </FeatureCard>

            <FeatureCard
              icon={<Layers className="h-5 w-5" />}
              title="Decks prontos + personalizados"
              badge="Comece rápido"
            >
              Use decks curados por área ou crie os seus com perguntas, respostas e tags. Combine com o banco de erros
              para uma fila de revisão única, priorizada pelo FSRS.
            </FeatureCard>

            <FeatureCard
              icon={<RefreshCcw className="h-5 w-5" />}
              title="Sincronização multi-dispositivo"
              badge="Continue de onde parou"
            >
              Estude no computador em casa e continue no celular na fila do metrô. Todos os dados — flashcards, erros,
              anexos e registros — sincronizados entre seus dispositivos automaticamente.
            </FeatureCard>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-7xl px-6 py-20">
          <SectionHeader
            kicker="Como funciona"
            title="Do cadastro à aprovação em 5 passos"
            subtitle="Um fluxo simples desenhado para você começar a estudar em minutos."
          />

          <ol className="mt-14 grid gap-5 md:grid-cols-5">
            {[
              { t: "Cadastre-se", d: "Crie sua conta em segundos, sem cartão de crédito." },
              { t: "Escolha ou crie decks", d: "Use decks prontos ou monte os seus com perguntas e respostas." },
              { t: "Estude diariamente", d: "Avalie cada card (Errei, Difícil, Bom, Fácil) e registre estudos." },
              { t: "Acompanhe desempenho", d: "Veja acertos, erros e áreas críticas em tempo real." },
              { t: "Revise com FSRS", d: "O algoritmo agenda a próxima revisão no momento ideal." },
            ].map((s, i) => (
              <li key={s.t} className="rf-card rf-card-hover relative p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 font-display text-sm text-primary ring-1 ring-primary/30">
                    {i + 1}
                  </span>
                  <h3 className="font-display text-base font-semibold">{s.t}</h3>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Planos - simplificado */}
        <section id="planos" className="mx-auto max-w-7xl px-6 py-20">
          <SectionHeader
            kicker="Planos"
            title="Comece com 30 dias grátis"
            subtitle="Acesso completo a tudo durante o teste. Sem cartão. Sem limites. Sem pegadinhas."
          />
          <div className="mt-14 flex justify-center">
            <div className="relative rf-card p-8 max-w-md w-full border-primary/40 shadow-[0_30px_80px_-30px_rgba(20,184,166,0.45)]">
              <div className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                Teste grátis
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Plano Pro
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold">30 dias grátis</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Acesso completo a todas as funcionalidades. Sem cartão. Sem compromisso.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Flashcards FSRS ilimitados",
                  "Banco de erros e revisões DSM30",
                  "Anexos e sincronização multi-dispositivo",
                  "Suporte prioritário",
                  "Cancelamento a qualquer momento",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/cadastro"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
              >
                Começar teste grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Instalar PWA */}
        <section id="instalar" className="mx-auto max-w-7xl px-6 py-20">
          <SectionHeader
            kicker="PWA"
            title="Instale como aplicativo nativo"
            subtitle="Ícone na tela inicial, funciona offline e atualiza sozinho. Sem passar pela loja."
          />

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            <InstallCard
              icon={<Chrome className="h-5 w-5" />}
              platform="Android (Chrome)"
              steps={[
                "Abra o RevisaFlash no navegador Chrome.",
                "Toque nos três pontinhos no canto superior direito.",
                "Selecione \"Adicionar à tela inicial\" (ou \"Instalar aplicativo\").",
                "Confirme o nome (RevisaFlash) e toque em \"Adicionar\".",
                "O ícone aparecerá na tela inicial do celular.",
                "Abra pelo ícone e comece a estudar.",
              ]}
            />
            <InstallCard
              icon={<Apple className="h-5 w-5" />}
              platform="iPhone / iPad (Safari)"
              steps={[
                "Abra o RevisaFlash no navegador Safari.",
                "Toque no ícone de compartilhar (quadrado com seta para cima).",
                "Role e toque em \"Adicionar à Tela de Início\".",
                "Confirme o nome (RevisaFlash) e toque em \"Adicionar\".",
                "O ícone aparecerá na tela inicial do iPhone.",
                "Abra pelo ícone e comece a estudar.",
              ]}
            />
          </div>

          <div className="mt-6 rf-card p-5 text-sm text-muted-foreground">
            <b className="text-foreground">Observações:</b> alguns recursos (login, cadastro e sincronização inicial)
            precisam de internet. O app é atualizado automaticamente ao abrir. Dados sincronizados entre dispositivos
            quando você está logado com a mesma conta.
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-surface to-accent/10 p-10 text-center md:p-16">
            <div className="pointer-events-none absolute -top-16 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
            <h2 className="relative font-display text-3xl font-semibold md:text-4xl">
              Pronto para revisar de verdade?
            </h2>
            <p className="relative mt-3 text-muted-foreground">
              30 dias grátis. Sem cartão. Sem limites. Cancele quando quiser depois.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_20px_50px_-16px_rgba(20,184,166,0.7)] hover:bg-primary/90 transition"
              >
                Começar teste grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#funcionalidades"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/70 backdrop-blur px-6 py-3 text-sm font-medium hover:bg-muted transition"
              >
                Explorar funcionalidades
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 ring-1 ring-primary/30">
              <Zap className="h-4 w-4 text-primary" />
            </span>
            <span className="font-display text-sm">
              Revisa<span className="text-primary">Flash</span>
            </span>
            <span className="text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#funcionalidades" className="hover:text-foreground transition">Funcionalidades</a>
            <a href="#planos" className="hover:text-foreground transition">Planos</a>
            <Link to="/login" className="hover:text-foreground transition">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

function BackgroundFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="absolute top-1/3 right-[-10%] h-[420px] w-[420px] rounded-full bg-accent/10 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ECFEFF 1px, transparent 1px), linear-gradient(to bottom, #ECFEFF 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{kicker}</span>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-4 text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  badge,
  children,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <article className="rf-card rf-card-hover group flex h-full flex-col p-6">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-lg ring-1 transition ${
            accent
              ? "bg-accent/15 text-accent ring-accent/30 group-hover:bg-accent/25"
              : "bg-primary/15 text-primary ring-primary/30 group-hover:bg-primary/25"
          }`}
        >
          {icon}
        </span>
        <div>
          <h3 className="font-display text-base font-semibold leading-none">{title}</h3>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{badge}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  );
}

function InstallCard({
  icon,
  platform,
  steps,
}: {
  icon: React.ReactNode;
  platform: string;
  steps: string[];
}) {
  return (
    <div className="rf-card p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
          {icon}
        </span>
        <h3 className="font-display text-lg font-semibold">{platform}</h3>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted font-display text-xs text-primary">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HeroMockup() {
  return (
    <div className="relative rf-fade-in">
      <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/25 via-transparent to-accent/20 blur-2xl" />
      <div className="relative rounded-2xl border border-border bg-surface/80 p-4 shadow-elevated backdrop-blur">
        <div className="flex items-center gap-1.5 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
          <span className="ml-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            revisaflash.app
          </span>
        </div>

        <div className="rounded-xl border border-border bg-background p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Bom dia, Mariana</p>
              <h4 className="mt-1 font-display text-lg font-semibold">ENARE 2026</h4>
            </div>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/25">
              79 dias
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { l: "Streak", v: "12", i: <Flame className="h-3.5 w-3.5" /> },
              { l: "Cards hoje", v: "38", i: <Brain className="h-3.5 w-3.5" /> },
              { l: "Erros", v: "07", i: <Target className="h-3.5 w-3.5" /> },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.i}
                  {s.l}
                </div>
                <div className="mt-1 font-display text-xl">{s.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Revisões desta semana</span>
              <span className="text-primary">FSRS</span>
            </div>
            <div className="mt-3 flex items-end gap-1.5 h-20">
              {[40, 65, 30, 80, 55, 90, 45].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-primary/30 to-primary"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-accent/25 bg-accent/10 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="rf-pulse h-2 w-2 rounded-full bg-accent" />
              <span className="text-foreground">Erro adicionado ao deck automaticamente</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-accent">Auto</span>
          </div>
        </div>
      </div>
    </div>
  );
}