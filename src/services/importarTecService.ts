// src/services/importarTecService.ts
import JSZip from 'jszip';
import { supabase } from '@/lib/supabaseClient';
import { importarQuestoesNoBanco } from './bancoQuestoesService';
import type { QuestaoParsed } from './pdfBancoParser';

export interface ResultadoImportacaoTec {
  success: boolean;
  novas: number;
  jaExistentes: number;
  erros: number;
  error?: string;
}

export async function importarArquivoTec(
  file: File,
  userId: string,
  onProgress: (mensagem: string, porcentagem: number) => void
): Promise<ResultadoImportacaoTec> {
  
  try {
    // 1. Lê o arquivo ZIP
    onProgress("Lendo arquivo ZIP...", 5);
    const zip = new JSZip();
    const zipAberto = await zip.loadAsync(file);

    // 2. Procura o arquivo JSON dentro do ZIP
    const nomeArquivoJson = Object.keys(zipAberto.files).find(nome => nome.endsWith('questoes_tec.json'));
    if (!nomeArquivoJson) {
      return { success: false, novas: 0, jaExistentes: 0, erros: 0, error: "Arquivo questoes_tec.json não encontrado no ZIP." };
    }

    // 3. Lê o conteúdo do JSON
    onProgress("Processando questões...", 10);
    const conteudoJsonStr = await zipAberto.files[nomeArquivoJson].async("string");
    let questoes: QuestaoParsed[] = JSON.parse(conteudoJsonStr);

    const totalQuestoes = questoes.length;
    
    // 4. Processa as imagens de cada questão
    for (let i = 0; i < totalQuestoes; i++) {
      const q = questoes[i];
      const porcentagemAtual = 10 + Math.floor(((i + 1) / totalQuestoes) * 80); // Vai de 10% a 90%
      onProgress(`Processando imagens da questão ${i + 1} de ${totalQuestoes}...`, porcentagemAtual);

      // Função para achar a tag [IMAGEM: nome.png] no texto
      const regexImagem = /\[IMAGEM:\s*(.+?)\]/g;

      // 4.1 Processa Imagens do Enunciado
      if (q.enunciado) {
        const match = regexImagem.exec(q.enunciado);
        if (match) {
          const nomeImagem = match[1].trim();
          const imagemNoZip = zipAberto.file(`imagens/${nomeImagem}`);
          
          if (imagemNoZip) {
            const blob = await imagemNoZip.async("blob");
            // Faz upload pro Supabase
            const urlSupabase = await uploadImagemSupabase(blob, nomeImagem, userId);
            if (urlSupabase) {
              q.enunciado = q.enunciado.replace(match[0], `[IMAGEM: ${urlSupabase}]`);
              q.imagem_url = urlSupabase; // Atualiza o campo do banco
              q.__nome_imagem = urlSupabase;
            }
          }
        }
      }

      // 4.2 Processa Imagens do Comentário
      if (q.comentario) {
        // Usamos o replace assíncrono para poder esperar o upload
        const matches = [...q.comentario.matchAll(regexImagem)];
        for (const match of matches) {
          const nomeImagem = match[1].trim();
          const imagemNoZip = zipAberto.file(`imagens/${nomeImagem}`);
          
          if (imagemNoZip) {
            const blob = await imagemNoZip.async("blob");
            const urlSupabase = await uploadImagemSupabase(blob, nomeImagem, userId);
            if (urlSupabase) {
              q.comentario = q.comentario.replace(match[0], `[IMAGEM: ${urlSupabase}]`);
            }
          }
        }
      }
    }

    // 5. Salva no banco de dados do app
    onProgress("Salvando questões no Banco de Questões...", 95);
    const resultado = await importarQuestoesNoBanco(questoes, userId);

    onProgress("Concluído!", 100);

    return {
      success: resultado.success,
      novas: resultado.novas,
      jaExistentes: resultado.jaExistentes,
      erros: resultado.erros,
      error: resultado.error
    };

  } catch (e: any) {
    console.error("Erro ao importar TEC:", e);
    return { success: false, novas: 0, jaExistentes: 0, erros: 0, error: e.message || "Erro desconhecido ao descompactar o arquivo." };
  }
}

// Função auxiliar para subir a imagem pro Supabase
async function uploadImagemSupabase(blob: Blob, nomeOriginal: string, userId: string): Promise<string | null> {
  try {
    // Gera um nome único para não sobrescrever imagens de outros cadernos
    const nomeArquivo = `${userId}/${Date.now()}_${nomeOriginal}`;
    
    // Faz o upload para o bucket questoes-imagens
    const { data, error } = await supabase.storage
      .from('questoes-imagens')
      .upload(nomeArquivo, blob, { upsert: true });

    if (error) {
      console.error("Erro no upload da imagem:", error);
      return null;
    }

    // Pega a URL pública da imagem
    const { data: urlData } = supabase.storage
      .from('questoes-imagens')
      .getPublicUrl(nomeArquivo);

    return urlData.publicUrl;
  } catch (e) {
    console.error("Falha ao subir imagem:", e);
    return null;
  }
}