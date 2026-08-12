import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/app-shell";
import { 
  Bell, Moon, Sun, Download, Trash2, LogOut, Cloud, 
  Upload, FileText, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp, 
  User, Mail, Calendar, Clock, Layers, Sparkles, BookOpen, Database,
  Camera, HelpCircle, Save, Loader2, Settings, Zap, TrendingUp, AlertTriangle
} from "lucide-react";
import { useAppUser } from "@/contexts/UserContext";
import { useClerk } from "@clerk/clerk-react";
import { supabase, getSupabaseWithToken } from "@/lib/supabaseClient";
import { uid } from "@/utils/helpers";
import { getDb } from "@/lib/db";

// 🔥 Importar o FlashcardContext
import { useFlashcardContext } from "@/contexts/FlashcardContext";

export default function ConfigPage() {
  // ============================================================
  // ESTADOS DO TEMA
  // ============================================================
  const [tema, setTema] = useState<"escuro" | "claro" | "sistema">("escuro");

  // ============================================================
  // CONTEXTO DO USUÁRIO
  // ============================================================
  const { user, isLoaded } = useAppUser();
  const { signOut } = useClerk();

  // 🔥 CONTEXTO DOS FLASHCARDS (para configurações)
  const {
    getUserSettings,
    updateUserSettings,
    settings: contextSettings,
    dailyLimit,
    loading: contextLoading
  } = useFlashcardContext();

  // ============================================================
  // ESTADOS FUNCIONAIS (originais)
  // ============================================================
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [mensagemTipo, setMensagemTipo] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const [uploading, setUploading] = useState(false);
  
  // Plano de estudos (originais)
  const [provaNome, setProvaNome] = useState<string>("ENARE Odontologia 2026");
  const [provaData, setProvaData] = useState<string>("2026-09-13");
  const [salvandoProva, setSalvandoProva] = useState(false);
  
  // Excluir conta
  const [deletandoConta, setDeletandoConta] = useState(false);

  // Importar Anki
  const [importando, setImportando] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importStats, setImportStats] = useState({ total: 0, importados: 0, ignorados: 0, erros: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup
  const [backupMensagem, setBackupMensagem] = useState("");
  const [backupMensagemTipo, setBackupMensagemTipo] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // 🔥 NOVOS ESTADOS PARA CONFIGURAÇÕES DE FLASHCARDS
  // ============================================================
  const [flashcardSettings, setFlashcardSettings] = useState({
    daily_limit: 100,
    new_cards_per_day: 20,
    max_reviews_per_day: 200,
    leech_threshold: 5,
    show_new_first: false,
    learning_steps: [1, 10],
    graduating_interval: 1,
    easy_interval: 4,
    relearning_steps: [10],
    day_start: 4,
    show_next_review_time: false,
  });
  const [salvandoFlashcards, setSalvandoFlashcards] = useState(false);

  // ============================================================
  // CARREGAR USUÁRIO E PERFIL (ORIGINAL)
  // ============================================================
  useEffect(() => {
    const loadUser = async () => {
      try {
        if (!isLoaded) return;
        
        const clerkUserId = user?.id || null;
        if (!clerkUserId) {
          console.warn('Nenhum usuário encontrado.');
          return;
        }

        setUserId(clerkUserId);
        setUserEmail(user?.emailAddresses?.[0]?.emailAddress || '');
        setUserName(user?.fullName || user?.username || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 'Usuário');

        try {
          const supabaseClient = await getSupabaseWithToken();
          const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('name, avatar_url, theme, prova_nome, prova_data')
            .eq('id', clerkUserId)
            .maybeSingle();

          if (error) {
            console.warn('Erro ao carregar perfil:', error);
            return;
          }

          if (profile) {
            if (profile.name) setUserName(profile.name);
            if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
            if (profile.theme) {
              setTema(profile.theme);
              localStorage.setItem('tema', profile.theme);
              aplicarTema(profile.theme);
            }
            if (profile.prova_nome) setProvaNome(profile.prova_nome);
            if (profile.prova_data) setProvaData(profile.prova_data);
          }
        } catch (offlineError) {
          console.warn('Offline: usando dados do localStorage para perfil');
        }
      } catch (e) {
        console.warn('Erro ao carregar usuário:', e);
      }
    };
    loadUser();
  }, [user, isLoaded]);

  // 🔥 CARREGAR CONFIGURAÇÕES DE FLASHCARDS
  useEffect(() => {
    const loadFlashcardSettings = async () => {
      try {
        const settings = await getUserSettings();
        setFlashcardSettings({
          daily_limit: settings.daily_limit,
          new_cards_per_day: settings.new_cards_per_day,
          max_reviews_per_day: settings.max_reviews_per_day,
          leech_threshold: settings.leech_threshold,
          show_new_first: settings.show_new_first,
          learning_steps: settings.learning_steps || [1, 10],
          graduating_interval: settings.graduating_interval,
          easy_interval: settings.easy_interval,
          relearning_steps: settings.relearning_steps || [10],
          day_start: settings.day_start,
          show_next_review_time: settings.show_next_review_time,
        });
      } catch (error) {
        console.warn('Erro ao carregar configurações de flashcards:', error);
      }
    };
    if (userId) {
      loadFlashcardSettings();
    }
  }, [userId, getUserSettings]);

  // ============================================================
  // TEMA (ORIGINAL)
  // ============================================================
  useEffect(() => {
    const temaSalvo = localStorage.getItem('tema') as 'escuro' | 'claro' | 'sistema' | null;
    if (temaSalvo) {
      setTema(temaSalvo);
      aplicarTema(temaSalvo);
    } else {
      aplicarTema('escuro');
    }
  }, []);

  const aplicarTema = (tema: 'escuro' | 'claro' | 'sistema') => {
    const body = document.body;
    body.classList.remove('tema-escuro', 'tema-claro');
    if (tema === 'escuro') body.classList.add('tema-escuro');
    else if (tema === 'claro') body.classList.add('tema-claro');
  };

  const handleTemaChange = async (novoTema: 'escuro' | 'claro' | 'sistema') => {
    setTema(novoTema);
    localStorage.setItem('tema', novoTema);
    aplicarTema(novoTema);

    if (userId) {
      try {
        const supabaseClient = await getSupabaseWithToken();
        await supabaseClient
          .from('profiles')
          .upsert({ id: userId, theme: novoTema, updated_at: new Date().toISOString() })
          .select();
      } catch (error) {
        console.warn('Offline: tema salvo apenas localmente');
      }
    }
  };

  // ============================================================
  // FUNÇÕES ORIGINAIS (PLANO DE ESTUDOS, AVATAR, NOME, ETC.)
  // ============================================================
  const handleSaveProva = useCallback(async () => {
    if (!userId) {
      setMensagem("❌ Usuário não autenticado.");
      setMensagemTipo('error');
      return;
    }
    if (!provaNome.trim()) {
      setMensagem("⚠️ Digite o nome da prova.");
      setMensagemTipo('warning');
      return;
    }

    setSalvandoProva(true);
    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('profiles')
        .upsert({
          id: userId,
          prova_nome: provaNome.trim(),
          prova_data: provaData,
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) throw error;

      setMensagem("✅ Plano de estudos atualizado com sucesso!");
      setMensagemTipo('success');
      setTimeout(() => setMensagem(""), 4000);
    } catch (error: any) {
      console.warn('Offline: plano de estudos salvo apenas localmente');
      setMensagem("✅ Plano salvo localmente (será sincronizado quando online)");
      setMensagemTipo('info');
      localStorage.setItem('offline_prova_nome', provaNome);
      localStorage.setItem('offline_prova_data', provaData);
    } finally {
      setSalvandoProva(false);
    }
  }, [userId, provaNome, provaData]);

  const handleUploadAvatar = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) {
      setMensagem('⚠️ Nenhum arquivo selecionado ou usuário não autenticado.');
      setMensagemTipo('error');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMensagem('⚠️ Selecione uma imagem válida (PNG, JPG).');
      setMensagemTipo('error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMensagem('⚠️ A imagem deve ter no máximo 2MB.');
      setMensagemTipo('error');
      return;
    }

    setUploading(true);
    setMensagem('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const supabaseClient = await getSupabaseWithToken();

      const { error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const avatarUrl = urlData.publicUrl;

      const { error: updateError } = await supabaseClient
        .from('profiles')
        .upsert({ id: userId, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .select();

      if (updateError) throw updateError;

      setAvatarUrl(avatarUrl);
      setMensagem('✅ Foto de perfil atualizada com sucesso!');
      setMensagemTipo('success');
      
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      setMensagem('❌ Erro ao fazer upload: ' + (error.message || 'Erro desconhecido'));
      setMensagemTipo('error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }, [userId]);

  const handleUpdateName = useCallback(async (nome: string) => {
    if (!userId || !nome.trim()) return;
    try {
      const supabaseClient = await getSupabaseWithToken();
      const { error } = await supabaseClient
        .from('profiles')
        .upsert({ id: userId, name: nome.trim(), updated_at: new Date().toISOString() })
        .select();
      if (error) throw error;
      setUserName(nome.trim());
      setMensagem('✅ Nome atualizado com sucesso!');
      setMensagemTipo('success');
      setTimeout(() => setMensagem(''), 3000);
    } catch (error: any) {
      console.warn('Offline: nome salvo apenas localmente');
      setUserName(nome.trim());
      setMensagem('✅ Nome salvo localmente (sincronizará quando online)');
      setMensagemTipo('info');
      localStorage.setItem('offline_user_name', nome.trim());
    }
  }, [userId]);

  // ============================================================
  // FUNÇÕES DE IMPORTAÇÃO ANKI E BACKUP (ORIGINAIS)
  // ============================================================
  const importarAnki = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportando(true);
    setMensagem("");
    setImportPreview([]);
    setImportStats({ total: 0, importados: 0, ignorados: 0, erros: 0 });

    try {
      const text = await file.text();
      const linhas = text.split('\n').filter(line => line.trim() !== '');
      
      let separador = '\t';
      const primeiraLinha = linhas[0] || '';
      if (primeiraLinha.includes('\t')) separador = '\t';
      else if (primeiraLinha.includes(';')) separador = ';';
      else if (primeiraLinha.includes(',')) separador = ',';

      const cards = linhas
        .map(line => {
          const parts = line.split(separador);
          if (parts.length >= 2) {
            return {
              front: parts[0].trim(),
              back: parts.slice(1).join(separador).trim(),
            };
          }
          return null;
        })
        .filter((card): card is { front: string; back: string } => 
          card !== null && card.front !== '' && card.back !== ''
        );

      if (cards.length === 0) {
        setMensagem("❌ Nenhum flashcard válido encontrado. Verifique o formato (pergunta\tresposta)");
        setMensagemTipo('error');
        setImportando(false);
        return;
      }

      setImportPreview(cards.slice(0, 10));
      setShowPreview(true);
      setImportStats({ total: cards.length, importados: 0, ignorados: 0, erros: 0 });

      const confirmar = confirm(
        `📚 Encontrados ${cards.length} flashcards.\n\n` +
        `Primeiro: "${cards[0].front}" → "${cards[0].back}"\n\n` +
        `Deseja importar todos?`
      );

      if (!confirmar) {
        setImportando(false);
        setShowPreview(false);
        return;
      }

      if (!userId) {
        setMensagem("❌ Usuário não autenticado. Faça login para importar.");
        setMensagemTipo('error');
        setImportando(false);
        return;
      }

      const now = new Date().toISOString();
      const deckName = `Anki Import ${new Date().toLocaleDateString('pt-BR')}`;

      const db = await getDb();
      
      const deckId = uid();
      await db.decks.insert({
        id: deckId,
        name: deckName,
        description: `Importado do Anki em ${new Date().toLocaleDateString('pt-BR')}`,
        user_id: userId,
        createdAt: now,
        color: '#14B8A6',
        deletedAt: null
      });

      let importados = 0;
      let erros = 0;

      for (const card of cards) {
        try {
          const cardId = uid();
          await db.flashcards.insert({
            id: cardId,
            deck_id: deckId,
            user_id: userId,
            front: card.front,
            back: card.back,
            difficulty: 5.0,
            stability: 1.0,
            retrievability: 0.9,
            dueDate: now,
            reps: 0,
            lapses: 0,
            lastReview: null,
            state: 0,
            elapsed_days: 0,
            scheduled_days: 1,
            createdAt: now,
            updatedAt: now
          });
          importados++;
        } catch (error) {
          erros++;
          console.error('Erro ao importar card:', error);
        }
      }

      setImportStats({ total: cards.length, importados, ignorados: 0, erros });
      setMensagem(`✅ Importação concluída! ${importados} importados, ${erros} erros.`);
      setMensagemTipo('success');

    } catch (error: any) {
      console.error('Erro ao importar:', error);
      setMensagem("❌ Erro ao importar: " + (error.message || 'Erro desconhecido'));
      setMensagemTipo('error');
    } finally {
      setImportando(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [userId]);

  const exportarBackup = useCallback(() => {
    try {
      const backup = {
        version: "1.0.0",
        data: new Date().toISOString(),
        dados: {
          disciplines: JSON.parse(localStorage.getItem('eot_disciplines') || '[]'),
          errors: JSON.parse(localStorage.getItem('eot_errors') || '[]'),
          flashcards: JSON.parse(localStorage.getItem('eot_flashcards') || '[]'),
          revisoes: JSON.parse(localStorage.getItem('eot_revisoes_conteudo') || '[]'),
          studyHistory: JSON.parse(localStorage.getItem('eot_study_history') || '{}'),
          decks: JSON.parse(localStorage.getItem('eot_decks') || '[]')
        }
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupMensagem("✅ Backup exportado com sucesso!");
      setBackupMensagemTipo('success');
      setTimeout(() => setBackupMensagem(""), 3000);
    } catch (error: any) {
      setBackupMensagem("❌ Erro ao exportar: " + (error.message || 'Erro desconhecido'));
      setBackupMensagemTipo('error');
    }
  }, []);

  const importarBackup = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string);
        if (backup.dados) {
          if (backup.dados.disciplines) localStorage.setItem('eot_disciplines', JSON.stringify(backup.dados.disciplines));
          if (backup.dados.errors) localStorage.setItem('eot_errors', JSON.stringify(backup.dados.errors));
          if (backup.dados.flashcards) localStorage.setItem('eot_flashcards', JSON.stringify(backup.dados.flashcards));
          if (backup.dados.revisoes) localStorage.setItem('eot_revisoes_conteudo', JSON.stringify(backup.dados.revisoes));
          if (backup.dados.studyHistory) localStorage.setItem('eot_study_history', JSON.stringify(backup.dados.studyHistory));
          if (backup.dados.decks) localStorage.setItem('eot_decks', JSON.stringify(backup.dados.decks));
          
          setBackupMensagem(`✅ Backup restaurado com sucesso! (${backup.dados.flashcards?.length || 0} flashcards)`);
          setBackupMensagemTipo('success');
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setBackupMensagem("❌ Arquivo de backup inválido");
          setBackupMensagemTipo('error');
        }
      } catch (error: any) {
        setBackupMensagem("❌ Erro ao ler o arquivo: " + (error.message || 'Formato inválido'));
        setBackupMensagemTipo('error');
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, []);

  // ============================================================
  // FUNÇÕES DE CONTA (ORIGINAIS)
  // ============================================================
  const handleLogout = useCallback(async () => {
    if (confirm("Deseja realmente sair?")) {
      try {
        await signOut();
        localStorage.removeItem('revisaflash_user_id');
        window.location.href = '/login';
      } catch (error) {
        console.error("Erro ao fazer logout:", error);
        localStorage.removeItem('revisaflash_user_id');
        window.location.href = '/login';
      }
    }
  }, [signOut]);

  const reabrirTour = useCallback(() => {
    if (!user?.id) {
      setMensagem("⚠️ Usuário não identificado.");
      setMensagemTipo('warning');
      return;
    }
    if (confirm("Deseja reabrir o tour de boas-vindas? Isso vai recarregar a página.")) {
      localStorage.removeItem(`tour_completed_${user.id}`);
      localStorage.removeItem('onboarding_completed');
      window.location.reload();
    }
  }, [user]);

  const handleDeleteAccount = useCallback(async () => {
    if (!userId) {
      setMensagem("❌ Usuário não autenticado.");
      setMensagemTipo('error');
      return;
    }

    const confirmar = confirm(
      "⚠️ ATENÇÃO: Essa ação é irreversível!\n\n" +
      "Todos os seus dados serão permanentemente excluídos.\n\n" +
      "Para excluir sua conta, você será redirecionado para o painel do Clerk.\n" +
      "Lá, você pode excluir o usuário manualmente.\n\n" +
      "Deseja continuar?"
    );

    if (!confirmar) return;

    setDeletandoConta(true);
    setMensagem("");

    try {
      try {
        const supabaseClient = await getSupabaseWithToken();
        await supabaseClient
          .from('profiles')
          .upsert({ 
            id: userId, 
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select();
      } catch (offlineError) {
        console.warn('Offline: não foi possível marcar exclusão no Supabase');
      }

      const keysToRemove = [
        'revisaflash_user_id',
        'revisaflash_user_name',
        'eot_decks',
        'eot_flashcards',
        'eot_errors',
        'eot_disciplines',
        'eot_revisoes_conteudo',
        'eot_study_history',
        'dashboard_checklist',
        'eot_deck_metas',
        'eot_card_metas',
        `tour_completed_${userId}`,
        'onboarding_completed'
      ];
      keysToRemove.forEach(key => localStorage.removeItem(key));

      window.open('https://dashboard.clerk.com/users', '_blank');
      await signOut();

      setMensagem("📋 Redirecionado para o Clerk. Exclua seu usuário manualmente.");
      setMensagemTipo('info');
      
      setTimeout(() => {
        window.location.href = '/login';
      }, 3000);

    } catch (error: any) {
      console.error("❌ Erro ao excluir conta:", error);
      setMensagem("❌ Erro ao excluir conta. Tente novamente.");
      setMensagemTipo('error');
    } finally {
      setDeletandoConta(false);
    }
  }, [userId, signOut]);

  // ============================================================
  // 🔥 FUNÇÃO PARA SALVAR CONFIGURAÇÕES DE FLASHCARDS
  // ============================================================
  const handleSaveFlashcardSettings = useCallback(async () => {
    // Validações
    if (flashcardSettings.daily_limit < 1) {
      setMensagem("⚠️ O limite diário deve ser pelo menos 1.");
      setMensagemTipo('warning');
      return;
    }
    if (flashcardSettings.new_cards_per_day < 0) {
      setMensagem("⚠️ O número de novos cards não pode ser negativo.");
      setMensagemTipo('warning');
      return;
    }
    if (flashcardSettings.max_reviews_per_day < 0) {
      setMensagem("⚠️ O número de revisões não pode ser negativo.");
      setMensagemTipo('warning');
      return;
    }
    if (flashcardSettings.leech_threshold < 1) {
      setMensagem("⚠️ O limiar de sanguessuga deve ser pelo menos 1.");
      setMensagemTipo('warning');
      return;
    }

    setSalvandoFlashcards(true);
    try {
      await updateUserSettings({
        daily_limit: flashcardSettings.daily_limit,
        new_cards_per_day: flashcardSettings.new_cards_per_day,
        max_reviews_per_day: flashcardSettings.max_reviews_per_day,
        leech_threshold: flashcardSettings.leech_threshold,
        show_new_first: flashcardSettings.show_new_first,
        learning_steps: flashcardSettings.learning_steps,
        graduating_interval: flashcardSettings.graduating_interval,
        easy_interval: flashcardSettings.easy_interval,
        relearning_steps: flashcardSettings.relearning_steps,
        day_start: flashcardSettings.day_start,
        show_next_review_time: flashcardSettings.show_next_review_time,
      });

      setMensagem("✅ Configurações de flashcards salvas com sucesso!");
      setMensagemTipo('success');
      setTimeout(() => setMensagem(""), 4000);
    } catch (error: any) {
      console.error("Erro ao salvar configurações de flashcards:", error);
      setMensagem("❌ Erro ao salvar: " + (error.message || 'Tente novamente.'));
      setMensagemTipo('error');
    } finally {
      setSalvandoFlashcards(false);
    }
  }, [flashcardSettings, updateUserSettings]);

  // ============================================================
  // HELPERS PARA OS CAMPOS DE ARRAY
  // ============================================================
  const arrayToString = (arr: number[]) => arr.join(', ');
  const stringToArray = (str: string): number[] => {
    return str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <AppShell breadcrumb="Configurações" title="Configurações">
      {mensagem && (
        <div className={`mb-4 p-3 rounded-xl text-sm border ${
          mensagemTipo === 'success' ? 'bg-green-500/20 text-green-400 border-green-500/20' : 
          mensagemTipo === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/20' : 
          mensagemTipo === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20' : 
          'bg-blue-500/20 text-blue-400 border-blue-500/20'
        }`}>
          {mensagem}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="rf-card p-2 lg:sticky lg:top-20 lg:self-start">
          {[
            ["perfil", "Perfil"],
            ["aparencia", "Aparência"],
            ["estudo", "Plano de estudos"],
            ["flashcards", "Flashcards"],
            ["dados", "Dados e sincronização"],
            ["conta", "Conta"],
          ].map(([k, l]) => (
            <a key={k} href={`#${k}`} className="block rounded-md px-3 py-2 text-sm text-foreground/65 hover:bg-white/5 transition-colors">
              {l}
            </a>
          ))}
        </nav>

        <div className="space-y-4">
          {/* PERFIL (ORIGINAL) */}
          <Section id="perfil" title="Perfil" desc="Suas informações pessoais.">
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={userName}
                    className="h-16 w-16 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-accent/15 font-display text-lg font-semibold text-accent">
                    {userName ? userName.slice(0, 2).toUpperCase() : 'U'}
                  </div>
                )}
                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <Camera className="h-3 w-3" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleUploadAvatar}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{userName || "Usuário"}</div>
                <div className="text-xs text-foreground/45">{userEmail || "carregando..."}</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nome completo"
                defaultValue={userName}
                onBlur={(e) => {
                  if (e.target.value !== userName) {
                    handleUpdateName(e.target.value);
                  }
                }}
              />
              <Input label="E-mail" defaultValue={userEmail} disabled className="opacity-60" />
            </div>
          </Section>

          {/* APARÊNCIA (ORIGINAL) */}
          <Section id="aparencia" title="Aparência" desc="Tema da interface.">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["escuro", "Escuro", <Moon key="m" className="h-4 w-4" />],
                ["claro", "Claro", <Sun key="s" className="h-4 w-4" />],
                ["sistema", "Sistema", <span key="sys" className="text-xs font-bold">A</span>],
              ] as const).map(([k, l, i]) => (
                <button
                  key={k as string}
                  onClick={() => handleTemaChange(k as typeof tema)}
                  className={[
                    "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    tema === k
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface-2 text-foreground/70 hover:bg-white/5",
                  ].join(" ")}
                >
                  {i} {l}
                </button>
              ))}
            </div>
            {/* 🔥 Adicionar Início do Dia aqui (opcional) */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <label className="block text-sm font-medium text-foreground/70">
                Início do dia (hora)
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={flashcardSettings.day_start}
                onChange={(e) => setFlashcardSettings(prev => ({ ...prev, day_start: Number(e.target.value) }))}
                className="mt-1 w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <p className="mt-1 text-xs text-foreground/40">Hora em que o dia começa (ex: 4 = 4h da manhã).</p>
            </div>
          </Section>

          {/* PLANO DE ESTUDOS (ORIGINAL) */}
          <Section id="estudo" title="Plano de estudos" desc="Configurações da sua prova-alvo.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Prova-alvo *</label>
                <input
                  type="text"
                  value={provaNome}
                  onChange={(e) => setProvaNome(e.target.value)}
                  placeholder="Ex: ENARE Odontologia 2026"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary placeholder:text-foreground/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">Data da prova *</label>
                <input
                  type="date"
                  value={provaData}
                  onChange={(e) => setProvaData(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={handleSaveProva}
                disabled={salvandoProva}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {salvandoProva ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Salvar plano
                  </>
                )}
              </button>
            </div>
          </Section>

          {/* ============================================================
              🔥 NOVA SEÇÃO: CONFIGURAÇÕES DE FLASHCARDS
              ============================================================ */}
          <Section id="flashcards" title="Configurações de Flashcards" desc="Personalize seu estudo com repetição espaçada.">
            {/* Limites Diários */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Limites Diários
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Limite total de cards por dia</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={flashcardSettings.daily_limit}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, daily_limit: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Novos cards por dia</label>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={flashcardSettings.new_cards_per_day}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, new_cards_per_day: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Máximo de revisões por dia</label>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={flashcardSettings.max_reviews_per_day}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, max_reviews_per_day: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
              <p className="text-[10px] text-foreground/35">
                O limite total é a soma de novos + revisões. Se você definir menos que a soma, o limite total prevalece.
              </p>
            </div>

            {/* Priorização e Sanguessugas */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-accent" />
                Priorização e Sanguessugas (Leeches)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Limiar de sanguessuga (erros)</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={flashcardSettings.leech_threshold}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, leech_threshold: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-foreground/35">
                    Quando um card atinge esse número de erros (lapses), ele é priorizado automaticamente.
                  </p>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-3 text-sm font-medium text-foreground/70">
                    <input
                      type="checkbox"
                      checked={flashcardSettings.show_new_first}
                      onChange={(e) => setFlashcardSettings(prev => ({ ...prev, show_new_first: e.target.checked }))}
                      className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                    />
                    Mostrar novos cards primeiro
                  </label>
                </div>
              </div>
            </div>

            {/* Passos de Aprendizado */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Passos de Aprendizado
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Passos de aprendizado (minutos)</label>
                  <input
                    type="text"
                    value={arrayToString(flashcardSettings.learning_steps)}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, learning_steps: stringToArray(e.target.value) }))}
                    placeholder="Ex: 1, 10"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-foreground/35">Intervalos entre as primeiras revisões de um card novo.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Passos de reaprendizado (minutos)</label>
                  <input
                    type="text"
                    value={arrayToString(flashcardSettings.relearning_steps)}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, relearning_steps: stringToArray(e.target.value) }))}
                    placeholder="Ex: 10"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-foreground/35">Intervalos quando você erra um card de revisão.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Intervalo de graduação (dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={flashcardSettings.graduating_interval}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, graduating_interval: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-foreground/35">Após concluir os passos de aprendizado, em quantos dias o card volta.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70">Intervalo fácil (dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={flashcardSettings.easy_interval}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, easy_interval: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                  <p className="mt-1 text-[10px] text-foreground/35">Intervalo para quando você avalia um card como "Fácil".</p>
                </div>
              </div>
            </div>

            {/* Comportamento durante estudo */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                Comportamento durante estudo
              </h3>
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-3 text-sm font-medium text-foreground/70">
                  <input
                    type="checkbox"
                    checked={flashcardSettings.show_next_review_time}
                    onChange={(e) => setFlashcardSettings(prev => ({ ...prev, show_next_review_time: e.target.checked }))}
                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  Mostrar tempo da próxima revisão durante o estudo
                </label>
              </div>
            </div>

            {/* Botão Salvar flashcards */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveFlashcardSettings}
                disabled={salvandoFlashcards}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {salvandoFlashcards ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Salvar configurações de flashcards
                  </>
                )}
              </button>
            </div>
          </Section>

          {/* DADOS E SINCRONIZAÇÃO (ORIGINAL) */}
          <Section id="dados" title="Dados e sincronização" desc="Importe flashcards, faça backup e gerencie seus dados.">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white mb-1 flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> Importar flashcards do Anki
              </h3>
              <p className="text-xs text-foreground/45 mb-3">
                Formatos: .txt, .csv, .apkg (tab separado: pergunta → resposta)
              </p>
              
              <label className={`w-full border-2 border-dashed ${
                importando ? 'border-primary/30 bg-primary/10' : 'border-primary/30 hover:border-primary/60'
              } py-4 text-center rounded-xl cursor-pointer transition-colors`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.apkg,.csv"
                  onChange={importarAnki}
                  className="hidden"
                  disabled={importando}
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className={`w-6 h-6 ${importando ? 'text-primary animate-pulse' : 'text-foreground/45'}`} />
                  <span className="text-sm text-foreground/65">
                    {importando ? '⏳ Importando...' : 'Clique para selecionar arquivo'}
                  </span>
                  <span className="text-xs text-foreground/35">.txt, .csv ou .apkg</span>
                </div>
              </label>

              {showPreview && importPreview.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {showPreview ? '▼' : '▶'} Preview dos primeiros cards
                  </button>
                  {showPreview && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {importPreview.map((card, index) => (
                        <div key={index} className="bg-white/5 rounded-lg p-2 text-xs">
                          <span className="text-primary">Pergunta:</span> {card.front}
                          <br />
                          <span className="text-accent">Resposta:</span> {card.back}
                        </div>
                      ))}
                      {importStats.total > 10 && (
                        <p className="text-xs text-foreground/35 text-center">+ {importStats.total - 10} cards</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importStats.total > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-lg font-bold text-white">{importStats.total}</p>
                    <p className="text-[10px] text-foreground/45">Total</p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-green-400">{importStats.importados}</p>
                    <p className="text-[10px] text-foreground/45">Importados</p>
                  </div>
                  <div className="bg-yellow-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-yellow-400">{importStats.ignorados}</p>
                    <p className="text-[10px] text-foreground/45">Ignorados</p>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-red-400">{importStats.erros}</p>
                    <p className="text-[10px] text-foreground/45">Erros</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Backup dos dados
              </h3>
              {backupMensagem && (
                <div className={`mb-3 p-2 rounded-lg text-sm ${
                  backupMensagemTipo === 'success' ? 'bg-green-500/20 text-green-400' : 
                  backupMensagemTipo === 'error' ? 'bg-red-500/20 text-red-400' : 
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {backupMensagem}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={exportarBackup}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-white/5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar backup (JSON)
                </button>
                <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Importar backup
                  <input
                    ref={backupFileInputRef}
                    type="file"
                    accept=".json"
                    onChange={importarBackup}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="mt-2 text-[10px] text-foreground/35">Exporta todos os seus dados (disciplinas, flashcards, erros, revisões, estudos)</p>
            </div>
          </Section>

          {/* CONTA (ORIGINAL) */}
          <Section id="conta" title="Conta" desc="Encerrar sessão, reabrir tour ou excluir conta.">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
              <button
                onClick={reabrirTour}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                <HelpCircle className="h-4 w-4" /> Reabrir tour
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletandoConta}
                className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletandoConta ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" /> Excluir conta
                  </>
                )}
              </button>
            </div>
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

// ============================================================
// COMPONENTES VISUAIS (ORIGINAIS)
// ============================================================

function Section({ id, title, desc, children }: { id: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rf-card p-5 scroll-mt-20">
      <header className="mb-4">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="text-xs text-foreground/45">{desc}</p>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Input({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground/70">{label}</span>
      <input {...rest} className={`w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary placeholder:text-foreground/40 ${className || ''}`} />
    </label>
  );
}