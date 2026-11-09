import { sb, ehAdmin, COLUNAS_PAGAMENTO, nomeArquivoSeguro, removerArquivos } from './supabase.js';
import { el, render, modal, toast, erro, ocupado, nomeMes, avatar, STATUS } from './ui.js';

const TAMANHO_MAX = 5 * 1024 * 1024; // 5 MB
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

// ---------------------------------------------------------------------
// Lista de campanhas
// ---------------------------------------------------------------------
export async function telaInicio() {
  const { data: campanhas, error } = await sb.from('campanhas').select('*').order('nome');
  if (error) throw error;

  if (campanhas.length === 1) {
    location.replace(`#/c/${campanhas[0].slug}`);
    return;
  }

  render(
    el('h1', { style: 'margin-bottom:20px' }, 'Campanhas'),
    campanhas.length
      ? el('div', { class: 'card' }, el('ul', { class: 'list-plain' }, campanhas.map((c) =>
          el('li', {}, el('a', { class: 'campaign-link', href: `#/c/${c.slug}` }, avatar(c), el('strong', {}, c.nome))))))
      : el('p', { class: 'muted center' }, 'Nenhuma campanha cadastrada ainda.'),
  );
}

// ---------------------------------------------------------------------
// Página da campanha: título, imagem e lista de pessoas por mês
// ---------------------------------------------------------------------
export async function telaCampanha(slug, mesId) {
  const admin = await ehAdmin();
  const { data: campanha, error } = await sb.from('campanhas').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!campanha) {
    render(el('p', { class: 'muted center' }, 'Campanha não encontrada.'));
    return;
  }
  document.title = campanha.nome;

  let selecionado = null; // id do pagamento selecionado
  let meses = [], pessoas = new Map(), pagamentos = [];

  async function carregar() {
    let q = sb.from('meses').select('*').eq('campanha_id', campanha.id);
    q = mesId ? q.eq('id', mesId) : q.eq('status', 'aberto');
    const r1 = await q.order('ano').order('mes');
    if (r1.error) throw r1.error;
    meses = (mesId && !admin) ? r1.data.filter((m) => m.status === 'aberto') : r1.data;

    const r2 = await sb.from('pessoas').select('id, nome').eq('campanha_id', campanha.id);
    if (r2.error) throw r2.error;
    pessoas = new Map(r2.data.map((p) => [p.id, p.nome]));

    if (meses.length) {
      const r3 = await sb.from('pagamentos')
        .select(admin ? '*' : COLUNAS_PAGAMENTO)
        .in('mes_id', meses.map((m) => m.id));
      if (r3.error) throw r3.error;
      pagamentos = r3.data;
    } else {
      pagamentos = [];
    }
  }

  async function recarregar() {
    try { await carregar(); desenhar(); } catch (e) { erro(e); }
  }

  function linhaPessoa(pag, mes) {
    const st = STATUS[pag.status];
    const aberto = mes.status === 'aberto';
    const sel = selecionado === pag.id;

    const clicar = () => {
      if (admin && pag.comprovante_path) { abrirRevisao(pag, recarregar); return; }
      selecionado = sel ? null : pag.id;
      desenhar();
    };

    // Ações exclusivas do administrador
    const marcarPago = () => el('button', {
      class: 'btn success',
      onclick: (ev) => ocupado(ev.currentTarget, async () => {
        try {
          await atualizarPagamento(pag.id, { status: 'validado', validado_em: new Date().toISOString() });
          toast('Marcado como pago ✅');
          selecionado = null;
          await recarregar();
        } catch (e) { erro(e); }
      }),
    }, 'Marcar como pago');

    const desfazerPago = () => el('button', {
      class: 'btn secondary',
      onclick: (ev) => ocupado(ev.currentTarget, async () => {
        if (!confirm('Desfazer o pagamento? O nome volta a ficar pendente.')) return;
        try {
          await atualizarPagamento(pag.id, { status: 'pendente', validado_em: null });
          toast('Pagamento desfeito');
          await recarregar();
        } catch (e) { erro(e); }
      }),
    }, 'Desfazer pagamento');

    let acoes = null;
    if (sel) {
      if (pag.status === 'pendente' && (aberto || admin)) {
        acoes = el('div', { class: 'person-actions' },
          aberto ? el('button', { class: 'btn', onclick: () => abrirEnvio(pag, pessoas.get(pag.pessoa_id), recarregar) }, 'Informar pagamento') : null,
          admin ? marcarPago() : null);
      } else if (pag.status === 'enviado') {
        acoes = el('div', { class: 'person-actions small muted' }, 'Comprovante enviado. Aguardando conferência do chefe Renatinho. 😸');
      } else if (pag.status === 'validado') {
        acoes = el('div', { class: 'person-actions' },
          el('span', { class: 'small muted' }, admin ? 'Pago, sem comprovante anexado.' : 'Pagamento conferido pelo Renatinho. Obrigado! 💛'),
          admin ? desfazerPago() : null);
      } else {
        acoes = el('div', { class: 'person-actions small muted' }, 'Este mês está encerrado.');
      }
    }

    return el('li', { class: `person ${pag.status}${sel ? ' selected' : ''}` },
      el('button', { class: 'person-row', onclick: clicar, 'aria-expanded': sel ? 'true' : 'false' },
        el('span', { class: 'person-icon', 'aria-hidden': 'true' }, st.icone),
        el('span', { class: 'person-name' }, pessoas.get(pag.pessoa_id) || '—'),
        el('span', { class: 'person-status' }, st.texto)),
      acoes);
  }

  function blocoMes(mes) {
    const lista = pagamentos
      .filter((p) => p.mes_id === mes.id)
      .sort((a, b) => (pessoas.get(a.pessoa_id) || '').localeCompare(pessoas.get(b.pessoa_id) || '', 'pt-BR'));
    const pagos = lista.filter((p) => p.status === 'validado').length;
    const enviados = lista.filter((p) => p.status === 'enviado').length;

    return el('section', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h2', {}, nomeMes(mes.ano, mes.mes)),
        el('span', { class: `badge${mes.status === 'encerrado' ? ' closed' : ''}` },
          mes.status === 'aberto' ? 'Em aberto' : 'Encerrado')),
      el('p', { class: 'summary' },
        `${pagos} de ${lista.length} pagos`, enviados ? ` · ${enviados} aguardando conferência do chefe Renatinho` : ''),
      lista.length
        ? el('ul', { class: 'people' }, lista.map((p) => linhaPessoa(p, mes)))
        : el('p', { class: 'muted' }, 'Nenhuma pessoa neste mês.'),
      el('p', { class: 'small muted', style: 'margin:12px 0 0' },
        admin ? 'Toque em um nome para ver o comprovante ou marcar como pago.' : 'Toque no seu nome para informar o pagamento.'));
  }

  function desenhar() {
    render(
      el('header', { class: 'campaign-header' },
        avatar(campanha),
        el('div', {},
          el('h1', {}, campanha.nome),
          admin ? el('a', { class: 'small', href: `#/admin/c/${campanha.slug}` }, 'Gerenciar campanha') : null)),
      meses.length
        ? meses.map(blocoMes)
        : el('div', { class: 'card center muted' }, mesId ? 'Mês não encontrado.' : 'Nenhum mês em aberto no momento.'),
    );
  }

  await carregar();
  desenhar();
}

// ---------------------------------------------------------------------
// Popup para enviar o comprovante (qualquer pessoa)
// ---------------------------------------------------------------------
function abrirEnvio(pag, nomePessoa, depois) {
  const input = el('input', { type: 'file', accept: 'image/*,application/pdf' });
  const aviso = el('p', { class: 'small muted' }, 'Imagem (JPG, PNG, WEBP) ou PDF, até 5 MB.');
  const enviar = el('button', { class: 'btn', disabled: true }, 'Enviar comprovante');

  input.addEventListener('change', () => {
    const f = input.files[0];
    let msg = 'Imagem (JPG, PNG, WEBP) ou PDF, até 5 MB.';
    let ok = !!f;
    if (f && !TIPOS_ACEITOS.includes(f.type)) { msg = 'Formato não aceito. Use imagem ou PDF.'; ok = false; }
    else if (f && f.size > TAMANHO_MAX) { msg = 'Arquivo maior que 5 MB.'; ok = false; }
    else if (f) msg = `Selecionado: ${f.name}`;
    aviso.textContent = msg;
    enviar.disabled = !ok;
  });

  const m = modal('Informar pagamento', el('div', { class: 'stack' },
    el('p', { style: 'margin:0' }, 'Enviando comprovante de ', el('strong', {}, nomePessoa), '.'),
    el('label', {}, 'Comprovante', input),
    aviso,
  ), [
    el('button', { class: 'btn secondary', onclick: () => m.fechar() }, 'Cancelar'),
    enviar,
  ]);

  enviar.addEventListener('click', () => ocupado(enviar, async () => {
    const arquivo = input.files[0];
    if (!arquivo) return;
    try {
      const caminho = `${pag.id}/${nomeArquivoSeguro(arquivo.name)}`;
      const up = await sb.storage.from('comprovantes').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (up.error) throw new Error('Não foi possível enviar. Talvez já exista um comprovante para este nome.');
      const { error } = await sb.rpc('informar_pagamento', { p_pagamento: pag.id, p_path: caminho });
      if (error) throw error;
      m.fechar();
      toast('Comprovante enviado! 🐾');
      depois();
    } catch (e) { erro(e); }
  }));
}

// ---------------------------------------------------------------------
// Popup do administrador para ver, validar, recusar ou excluir
// ---------------------------------------------------------------------
async function abrirRevisao(pag, depois) {
  const area = el('div', { class: 'preview' }, el('p', { class: 'muted center' }, 'Carregando comprovante…'));
  const botoes = [];
  const m = modal('Comprovante', el('div', { class: 'stack' },
    el('p', { class: 'small muted', style: 'margin:0' },
      `Status: ${STATUS[pag.status].texto}`,
      pag.enviado_em ? ` · enviado em ${new Date(pag.enviado_em).toLocaleString('pt-BR')}` : ''),
    area,
  ), botoes);

  const rodape = m.caixa.querySelector('.modal-foot') || m.caixa.appendChild(el('div', { class: 'modal-foot' }));

  const { data, error } = await sb.storage.from('comprovantes').createSignedUrl(pag.comprovante_path, 600);
  if (error) {
    area.replaceChildren(el('p', { class: 'muted center' }, 'Não foi possível abrir o arquivo.'));
  } else {
    const url = data.signedUrl;
    const ehPdf = pag.comprovante_path.toLowerCase().endsWith('.pdf');
    area.replaceChildren(ehPdf ? el('iframe', { src: url, title: 'Comprovante em PDF' }) : el('img', { src: url, alt: 'Comprovante' }));
    rodape.append(el('a', { class: 'btn link', href: url, target: '_blank', rel: 'noopener' }, 'Abrir em nova aba'));
  }

  // fn pode retornar false para cancelar (ex.: usuário não confirmou)
  const acao = (fn, msg) => (ev) => ocupado(ev.currentTarget, async () => {
    try {
      if (await fn() === false) return;
      m.fechar(); toast(msg); depois();
    } catch (e) { erro(e); }
  });

  if (pag.status === 'enviado') {
    rodape.append(
      el('button', {
        class: 'btn danger',
        onclick: acao(async () => {
          if (!confirm('Recusar e apagar este comprovante? A pessoa poderá enviar outro.')) return false;
          const { error } = await sb.from('pagamentos')
            .update({ status: 'pendente', comprovante_path: null, enviado_em: null, validado_em: null })
            .eq('id', pag.id);
          if (error) throw error;
          await removerArquivos('comprovantes', [pag.comprovante_path]);
        }, 'Comprovante recusado'),
      }, 'Recusar'),
      el('button', {
        class: 'btn success',
        onclick: acao(async () => {
          const { error } = await sb.from('pagamentos')
            .update({ status: 'validado', validado_em: new Date().toISOString() })
            .eq('id', pag.id);
          if (error) throw error;
        }, 'Pagamento validado ✅'),
      }, 'Validar'),
    );
  } else if (pag.status === 'validado') {
    rodape.append(el('button', {
      class: 'btn secondary',
      onclick: acao(async () => {
        if (!confirm('Cancelar a validação? O comprovante volta para "aguardando validação".')) return false;
        await atualizarPagamento(pag.id, { status: 'enviado', validado_em: null });
      }, 'Validação cancelada'),
    }, 'Cancelar validação'));
    rodape.append(el('button', {
      class: 'btn danger',
      onclick: acao(async () => {
        if (!confirm('Excluir o arquivo do comprovante? O pagamento continua como validado.')) return false;
        const { error } = await sb.from('pagamentos').update({ comprovante_path: null }).eq('id', pag.id);
        if (error) throw error;
        await removerArquivos('comprovantes', [pag.comprovante_path]);
      }, 'Comprovante excluído'),
    }, 'Excluir comprovante'));
  }
}

async function atualizarPagamento(id, dados) {
  const { error } = await sb.from('pagamentos').update(dados).eq('id', id);
  if (error) throw error;
}
