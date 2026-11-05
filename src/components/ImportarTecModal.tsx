// src/components/ImportarTecModal.tsx
import React, { useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileArchive } from 'lucide-react';
import { importarArquivoTec, type ResultadoImportacaoTec } from '../services/importarTecService';

interface ImportarTecModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string; // O ID do usuário logado (vem do Clerk)
}

export function ImportarTecModal({ isOpen, onClose, userId }: ImportarTecModalProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ mensagem: '', porcentagem: 0 });
  const [resultado, setResultado] = useState<ResultadoImportacaoTec | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setArquivo(e.target.files[0]);
      setResultado(null); // Limpa resultado anterior
    }
  };

  const handleImportar = async () => {
    if (!arquivo) return;
    if (!userId) {
      setResultado({ success: false, novas: 0, jaExistentes: 0, erros: 0, error: 'Usuário não autenticado.' });
      return;
    }

    setImportando(true);
    setProgresso({ mensagem: 'Iniciando...', porcentagem: 0 });

    const res = await importarArquivoTec(arquivo, userId, (mensagem, porcentagem) => {
      setProgresso({ mensagem, porcentagem });
    });

    setResultado(res);
    setImportando(false);
  };

  const handleFechar = () => {
    if (importando) return; // Impede fechar no meio da importação
    setArquivo(null);
    setResultado(null);
    setProgresso({ mensagem: '', porcentagem: 0 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-blue-600" />
            Importar do TEC
          </h2>
          <button onClick={handleFechar} disabled={importando} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6">
          {!resultado ? (
            <>
              {!importando ? (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    accept=".zip" 
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-10 h-10 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600 font-medium text-center">
                    {arquivo ? arquivo.name : "Clique ou arraste o arquivo .zip aqui"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Gerado pelo Robô do TEC</p>
                </div>
              ) : (
                <div className="flex flex-col items-center py-6">
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progresso.porcentagem}%` }}></div>
                  </div>
                  <p className="text-sm text-gray-600 animate-pulse">{progresso.mensagem}</p>
                </div>
              )}
            </>
          ) : (
            // Tela de Resultado
            <div className="flex flex-col items-center text-center">
              {resultado.success ? (
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
              ) : (
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
              )}
              
              <h3 className="text-lg font-bold text-gray-800 mb-2">
                {resultado.success ? 'Importação Concluída!' : 'Erro na Importação'}
              </h3>
              
              {resultado.error ? (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md w-full">{resultado.error}</p>
              ) : (
                <div className="grid grid-cols-3 gap-4 w-full mt-4">
                  <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                    <p className="text-2xl font-bold text-green-600">{resultado.novas}</p>
                    <p className="text-xs text-green-700 font-medium">Novas</p>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <p className="text-2xl font-bold text-yellow-600">{resultado.jaExistentes}</p>
                    <p className="text-xs text-yellow-700 font-medium">Já existiam</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                    <p className="text-2xl font-bold text-red-600">{resultado.erros}</p>
                    <p className="text-xs text-red-700 font-medium">Erros</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          {resultado ? (
            <button onClick={handleFechar} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors">
              Fechar
            </button>
          ) : (
            <>
              <button onClick={handleFechar} disabled={importando} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button 
                onClick={handleImportar} 
                disabled={!arquivo || importando} 
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {importando ? 'Importando...' : 'Iniciar Importação'}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}