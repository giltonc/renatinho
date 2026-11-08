import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configurado = !SUPABASE_URL.includes('SEU-PROJETO');

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Retorna true se há alguém logado e esse alguém está na tabela admins.
let cacheAdmin = null;
export async function ehAdmin() {
  if (cacheAdmin !== null) return cacheAdmin;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (cacheAdmin = false);
  const { data, error } = await sb.rpc('is_admin');
  return (cacheAdmin = !error && data === true);
}
sb.auth.onAuthStateChange(() => { cacheAdmin = null; });

// Colunas de pagamento que visitantes podem ler (sem o caminho do arquivo)
export const COLUNAS_PAGAMENTO = 'id, mes_id, pessoa_id, status, enviado_em, validado_em';

export function nomeArquivoSeguro(nome) {
  const ext = (nome.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? '.' + ext : ''}`;
}

export async function removerArquivos(bucket, caminhos) {
  const lista = caminhos.filter(Boolean);
  if (!lista.length) return;
  const { error } = await sb.storage.from(bucket).remove(lista);
  if (error) console.warn('Falha ao remover arquivos', error);
}
