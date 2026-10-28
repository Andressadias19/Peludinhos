import { perdidoName } from './PerdidoCard';

export const statusFilters = [['TODOS', 'Todos'], ['PERDIDO', 'Perdidos'], ['ENCONTRADO', 'Encontrados']];
const searchFields = ['nome_animal', 'especie', 'raca', 'cor', 'local_desaparecimento'];

// Minúsculas, sem acentos e sem espaços nas pontas: "  Sapé " encontra "sape".
export function normalizeSearch(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
}

// Filtra a lista já carregada, mantendo a ordem da API.
export function filterPerdidos(perdidos, { query = '', status = 'TODOS' } = {}) {
  const term = normalizeSearch(query);
  return perdidos.filter(item => (status === 'TODOS' || item.status_perda === status)
    && (!term || searchFields.some(field => normalizeSearch(item[field]).includes(term))));
}

// Qual mensagem mostrar quando não há cards: lista vazia não é o mesmo que busca sem resultado.
export function emptyState({ total, shown, loading, error }) {
  if (shown > 0) return null;
  if (total > 0) return 'noResults';
  if (!loading && !error) return 'noPublications';
  return null;
}

// Compartilha só o link público da página e um texto neutro: nunca token, telefone ou dados do tutor.
// O link continua exigindo login; o redirecionamento após o login devolve a pessoa à publicação.
export async function sharePerdido(item, { nav = globalThis.navigator, origin = globalThis.location?.origin } = {}) {
  const url = new URL(`/perdidos/${encodeURIComponent(item.id_perda)}`, origin).href;
  const text = item.status_perda === 'ENCONTRADO'
    ? `Veja a publicação de ${perdidoName(item)} no Peludinhos.`
    : `Ajude a encontrar ${perdidoName(item)}! Veja a publicação no Peludinhos.`;
  if (nav?.share) {
    try {
      await nav.share({ title: 'Peludinhos: animal perdido', text, url });
      return { kind: 'shared', url };
    } catch (err) {
      // Fechar a janela de compartilhamento não é um erro.
      if (err?.name === 'AbortError') return { kind: 'cancelled', url };
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(url);
      return { kind: 'copied', url, message: 'Link copiado para a área de transferência.' };
    } catch { /* cai na mensagem abaixo */ }
  }
  return { kind: 'error', url, message: `Não foi possível compartilhar automaticamente. Copie o link: ${url}` };
}
