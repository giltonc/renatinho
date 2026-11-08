import { configurado } from './supabase.js';
import { el, render } from './ui.js';
import { telaInicio, telaCampanha } from './campanha.js';
import { telaAdmin, telaAdminCampanha } from './admin.js';

// Rotas (usando # para funcionar em qualquer hospedagem estática):
//   #/                      lista de campanhas
//   #/c/<slug>              campanha (meses em aberto)
//   #/c/<slug>/m/<mesId>    um mês específico (admin vê meses encerrados)
//   #/admin                 login / painel do administrador
//   #/admin/c/<slug>        gerenciar uma campanha
async function rotear() {
  if (!configurado) {
    render(el('div', { class: 'card' },
      el('h2', {}, 'Falta configurar'),
      el('p', {}, 'Edite o arquivo js/config.js com a URL e a chave do seu projeto Supabase.')));
    return;
  }
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);
  try {
    if (partes[0] === 'c' && partes[1]) return await telaCampanha(partes[1], partes[2] === 'm' ? partes[3] : null);
    if (partes[0] === 'admin' && partes[1] === 'c' && partes[2]) return await telaAdminCampanha(partes[2]);
    if (partes[0] === 'admin') return await telaAdmin();
    return await telaInicio();
  } catch (e) {
    console.error(e);
    render(el('div', { class: 'card' },
      el('h2', {}, 'Não foi possível carregar'),
      el('p', { class: 'muted' }, e?.message || String(e))));
  }
}

window.addEventListener('hashchange', rotear);
rotear();
