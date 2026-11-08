// Pequenos utilitários de interface, sem dependências.

// Cria um elemento: el('button', { class: 'btn', onclick: fn }, 'Texto')
export function el(tag, attrs = {}, ...filhos) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    node.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return node;
}

export function render(...filhos) {
  const app = document.getElementById('app');
  app.replaceChildren(...filhos.flat().filter(Boolean));
}

let toastTimer;
export function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', erro);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

export function erro(e) {
  console.error(e);
  toast(e?.message || 'Algo deu errado', true);
}

// Abre um modal. Retorna { fechar, corpo }.
export function modal(titulo, conteudo, rodape = []) {
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
  const esc = (ev) => { if (ev.key === 'Escape') fechar(); };
  const corpo = el('div', {}, conteudo);
  const caixa = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    el('div', { class: 'modal-head' },
      el('h2', {}, titulo),
      el('button', { class: 'modal-close', 'aria-label': 'Fechar', onclick: fechar }, '×')),
    corpo,
    rodape.length ? el('div', { class: 'modal-foot' }, rodape) : null,
  );
  const fundo = el('div', { class: 'modal-backdrop', onclick: (ev) => { if (ev.target === fundo) fechar(); } }, caixa);
  document.body.append(fundo);
  document.addEventListener('keydown', esc);
  return { fechar, corpo, caixa };
}

// Desabilita um botão enquanto uma ação assíncrona roda
export async function ocupado(botao, fn) {
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguarde…';
  try { return await fn(); }
  finally { botao.disabled = false; botao.textContent = texto; }
}

export function nomeMes(ano, mes) {
  const nome = new Date(ano, mes - 1, 1).toLocaleString('pt-BR', { month: 'long' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}

export function avatar(campanha) {
  return campanha.imagem_url
    ? el('img', { src: campanha.imagem_url, alt: '' })
    : el('div', { class: 'avatar-placeholder', 'aria-hidden': 'true' }, '🐾');
}

export function slugify(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const STATUS = {
  pendente: { texto: 'Pendente', icone: '' },
  enviado: { texto: 'Comprovante enviado', icone: '📄' },
  validado: { texto: 'Pago', icone: '✅' },
};
