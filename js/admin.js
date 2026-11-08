import { sb, ehAdmin, nomeArquivoSeguro, removerArquivos } from './supabase.js';
import { el, render, toast, erro, ocupado, nomeMes, avatar, slugify, STATUS } from './ui.js';

// ---------------------------------------------------------------------
// Login + lista de campanhas
// ---------------------------------------------------------------------
export async function telaAdmin() {
  document.title = 'Administração';
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return telaLogin();

  if (!(await ehAdmin())) {
    render(el('div', { class: 'card stack' },
      el('h2', {}, 'Sem permissão'),
      el('p', { class: 'muted', style: 'margin:0' }, `O usuário ${session.user.email} não é administrador.`),
      el('div', {}, botaoSair())));
    return;
  }

  const { data: campanhas, error } = await sb.from('campanhas').select('*').order('nome');
  if (error) throw error;

  const nome = el('input', { type: 'text', placeholder: 'Ex.: Ração dos gatinhos', required: true });
  const slug = el('input', { type: 'text', placeholder: 'racao-dos-gatinhos', required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*' });
  let slugEditado = false;
  nome.addEventListener('input', () => { if (!slugEditado) slug.value = slugify(nome.value); });
  slug.addEventListener('input', () => { slugEditado = true; });
  const criar = el('button', { class: 'btn', type: 'submit' }, 'Criar campanha');

  const form = el('form', { class: 'stack' },
    el('label', {}, 'Nome', nome),
    el('label', {}, 'Endereço (aparece no link)', slug),
    el('div', {}, criar));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    ocupado(criar, async () => {
      const { error } = await sb.from('campanhas').insert({ nome: nome.value.trim(), slug: slugify(slug.value) });
      if (error) return erro(error.code === '23505' ? new Error('Já existe uma campanha com esse endereço.') : error);
      location.hash = `#/admin/c/${slugify(slug.value)}`;
    });
  });

  render(
    el('div', { class: 'topbar' }, el('h1', {}, 'Administração'), botaoSair()),
    el('section', { class: 'card' },
      el('h2', { style: 'margin-bottom:12px' }, 'Campanhas'),
      campanhas.length
        ? el('ul', { class: 'list-plain' }, campanhas.map((c) => el('li', {},
            el('a', { class: 'campaign-link grow', href: `#/admin/c/${c.slug}` }, avatar(c), el('strong', {}, c.nome)),
            el('a', { class: 'btn secondary small', href: `#/c/${c.slug}` }, 'Ver página'))))
        : el('p', { class: 'muted' }, 'Nenhuma campanha ainda.')),
    el('section', { class: 'card' }, el('h2', { style: 'margin-bottom:12px' }, 'Nova campanha'), form),
  );
}

function telaLogin() {
  const email = el('input', { type: 'email', autocomplete: 'username', required: true });
  const senha = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  const entrar = el('button', { class: 'btn', type: 'submit' }, 'Entrar');
  const form = el('form', { class: 'card stack' },
    el('h2', {}, 'Entrar como administrador'),
    el('label', {}, 'E-mail', email),
    el('label', {}, 'Senha', senha),
    el('div', {}, entrar));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    ocupado(entrar, async () => {
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
      if (error) return erro(new Error('E-mail ou senha incorretos.'));
      telaAdmin().catch(erro);
    });
  });
  render(form);
}

function botaoSair() {
  return el('button', {
    class: 'btn secondary small',
    onclick: async () => { await sb.auth.signOut(); toast('Você saiu.'); location.hash = '#/admin'; telaAdmin().catch(erro); },
  }, 'Sair');
}

// ---------------------------------------------------------------------
// Gerenciar uma campanha: dados, pessoas e meses
// ---------------------------------------------------------------------
export async function telaAdminCampanha(slug) {
  if (!(await ehAdmin())) { location.hash = '#/admin'; return; }

  const { data: campanha, error } = await sb.from('campanhas').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!campanha) { render(el('p', { class: 'muted center' }, 'Campanha não encontrada.')); return; }
  document.title = `${campanha.nome} · Administração`;

  let pessoas = [], meses = [], pagamentos = [];
  const abertos = new Set(); // meses com a lista expandida

  async function carregar() {
    const [r1, r2] = await Promise.all([
      sb.from('pessoas').select('*').eq('campanha_id', campanha.id).order('nome'),
      sb.from('meses').select('*').eq('campanha_id', campanha.id).order('ano', { ascending: false }).order('mes', { ascending: false }),
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    pessoas = r1.data;
    meses = r2.data;
    if (meses.length) {
      const r3 = await sb.from('pagamentos').select('*').in('mes_id', meses.map((m) => m.id));
      if (r3.error) throw r3.error;
      pagamentos = r3.data;
    } else pagamentos = [];
  }

  async function recarregar(msg) {
    try { await carregar(); desenhar(); if (msg) toast(msg); } catch (e) { erro(e); }
  }

  // Executa uma alteração no banco e recarrega a tela
  const executar = (botao, fn, msg) => ocupado(botao, async () => {
    try { if (await fn() === false) return; await recarregar(msg); } catch (e) { erro(e); }
  });

  const nomePessoa = (id) => pessoas.find((p) => p.id === id)?.nome || '—';

  // ---------- Dados da campanha ----------
  function secaoDados() {
    const nome = el('input', { type: 'text', value: campanha.nome, required: true });
    const imagem = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif' });
    const salvar = el('button', { class: 'btn', type: 'submit' }, 'Salvar');

    const form = el('form', { class: 'stack' },
      el('label', {}, 'Nome', nome),
      el('label', {}, 'Imagem (até 2 MB)', imagem),
      el('div', { class: 'row' },
        salvar,
        campanha.imagem_url ? el('button', {
          class: 'btn secondary', type: 'button',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            await apagarImagemAntiga();
            const { error } = await sb.from('campanhas').update({ imagem_url: null }).eq('id', campanha.id);
            if (error) throw error;
            campanha.imagem_url = null;
          }, 'Imagem removida'),
        }, 'Remover imagem') : null));

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      executar(salvar, async () => {
        const dados = { nome: nome.value.trim() };
        const arquivo = imagem.files[0];
        if (arquivo) {
          if (arquivo.size > 2 * 1024 * 1024) throw new Error('A imagem deve ter até 2 MB.');
          const caminho = `${campanha.id}/${nomeArquivoSeguro(arquivo.name)}`;
          const up = await sb.storage.from('campanhas').upload(caminho, arquivo, { contentType: arquivo.type });
          if (up.error) throw up.error;
          await apagarImagemAntiga();
          dados.imagem_url = sb.storage.from('campanhas').getPublicUrl(caminho).data.publicUrl;
        }
        const { error } = await sb.from('campanhas').update(dados).eq('id', campanha.id);
        if (error) throw error;
        Object.assign(campanha, dados);
      }, 'Campanha salva');
    });

    return el('section', { class: 'card' },
      el('h2', { style: 'margin-bottom:12px' }, 'Dados da campanha'),
      form);
  }

  async function apagarImagemAntiga() {
    const marcador = '/object/public/campanhas/';
    const url = campanha.imagem_url;
    if (url && url.includes(marcador)) await removerArquivos('campanhas', [url.split(marcador)[1]]);
  }

  // ---------- Pessoas ----------
  function secaoPessoas() {
    const nome = el('input', { type: 'text', placeholder: 'Nome da pessoa', required: true, class: 'grow' });
    const adicionar = el('button', { class: 'btn', type: 'submit' }, 'Adicionar');
    const form = el('form', { class: 'row', style: 'margin-bottom:8px' }, nome, adicionar);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      executar(adicionar, async () => {
        const { error } = await sb.from('pessoas').insert({ campanha_id: campanha.id, nome: nome.value.trim() });
        if (error) throw error;
      }, 'Pessoa adicionada');
    });

    return el('section', { class: 'card' },
      el('h2', {}, 'Pessoas'),
      el('p', { class: 'small muted' },
        'Pessoas ativas entram automaticamente nos novos meses. Para mudar a lista de um mês já criado, use "Editar lista" no mês.'),
      form,
      el('ul', { class: 'list-plain' }, pessoas.map((p) => el('li', {},
        el('span', { class: `grow${p.ativo ? '' : ' inactive'}` }, p.nome),
        el('button', {
          class: 'btn secondary small',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            const novo = prompt('Novo nome:', p.nome);
            if (!novo || !novo.trim() || novo.trim() === p.nome) return false;
            const { error } = await sb.from('pessoas').update({ nome: novo.trim() }).eq('id', p.id);
            if (error) throw error;
          }, 'Nome atualizado'),
        }, 'Renomear'),
        el('button', {
          class: 'btn secondary small',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            const { error } = await sb.from('pessoas').update({ ativo: !p.ativo }).eq('id', p.id);
            if (error) throw error;
          }, p.ativo ? 'Pessoa desativada' : 'Pessoa reativada'),
        }, p.ativo ? 'Desativar' : 'Reativar')))),
      pessoas.length ? null : el('p', { class: 'muted' }, 'Nenhuma pessoa cadastrada.'));
  }

  // ---------- Meses ----------
  function secaoMeses() {
    const hoje = new Date();
    const mesSel = el('select', {}, Array.from({ length: 12 }, (_, i) =>
      el('option', { value: i + 1, selected: i === hoje.getMonth() }, nomeMes(2000, i + 1).replace(' de 2000', ''))));
    const ano = el('input', { type: 'number', min: 2000, max: 2100, value: hoje.getFullYear(), style: 'max-width:110px' });
    const criar = el('button', { class: 'btn', type: 'submit' }, 'Abrir mês');
    const form = el('form', { class: 'row', style: 'margin-bottom:8px' }, el('div', { class: 'grow' }, mesSel), ano, criar);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      executar(criar, async () => {
        const { error } = await sb.rpc('criar_mes', { p_campanha: campanha.id, p_ano: Number(ano.value), p_mes: Number(mesSel.value) });
        if (error) throw error.code === '23505' ? new Error('Esse mês já existe.') : error;
      }, 'Mês aberto');
    });

    return el('section', { class: 'card' },
      el('h2', {}, 'Meses'),
      el('p', { class: 'small muted' }, 'Ao abrir um mês, todas as pessoas ativas entram na lista. Só meses em aberto aparecem na página da campanha.'),
      form,
      meses.length ? el('ul', { class: 'list-plain' }, meses.map(itemMes)) : el('p', { class: 'muted' }, 'Nenhum mês criado.'));
  }

  function itemMes(mes) {
    const lista = pagamentos.filter((p) => p.mes_id === mes.id);
    const pagos = lista.filter((p) => p.status === 'validado').length;
    const pendentesRevisao = lista.filter((p) => p.status === 'enviado').length;
    const expandido = abertos.has(mes.id);

    return el('li', { style: 'display:block' },
      el('div', { class: 'row' },
        el('div', { class: 'grow' },
          el('strong', {}, nomeMes(mes.ano, mes.mes)), ' ',
          el('span', { class: `badge${mes.status === 'encerrado' ? ' closed' : ''}` }, mes.status === 'aberto' ? 'Em aberto' : 'Encerrado'),
          el('div', { class: 'small muted' }, `${pagos}/${lista.length} pagos`, pendentesRevisao ? ` · ${pendentesRevisao} 📄 para validar` : '')),
        el('a', { class: 'btn secondary small', href: `#/c/${campanha.slug}/m/${mes.id}` }, 'Ver'),
        el('button', {
          class: 'btn secondary small',
          onclick: () => { expandido ? abertos.delete(mes.id) : abertos.add(mes.id); desenhar(); },
        }, expandido ? 'Fechar lista' : 'Editar lista'),
        el('button', {
          class: 'btn secondary small',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            const novo = mes.status === 'aberto' ? 'encerrado' : 'aberto';
            const { error } = await sb.from('meses').update({ status: novo }).eq('id', mes.id);
            if (error) throw error;
          }, mes.status === 'aberto' ? 'Mês encerrado' : 'Mês reaberto'),
        }, mes.status === 'aberto' ? 'Encerrar' : 'Reabrir'),
        el('button', {
          class: 'btn danger small',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            if (!confirm(`Excluir ${nomeMes(mes.ano, mes.mes)} e todos os comprovantes dele? Não dá para desfazer.`)) return false;
            const { error } = await sb.from('meses').delete().eq('id', mes.id);
            if (error) throw error;
            await removerArquivos('comprovantes', lista.map((p) => p.comprovante_path));
          }, 'Mês excluído'),
        }, 'Excluir')),
      expandido ? listaDoMes(mes, lista) : null);
  }

  function listaDoMes(mes, lista) {
    const fora = pessoas.filter((p) => !lista.some((l) => l.pessoa_id === p.id));
    const sel = el('select', { class: 'grow' },
      el('option', { value: '' }, fora.length ? 'Escolha uma pessoa…' : 'Todas as pessoas já estão na lista'),
      fora.map((p) => el('option', { value: p.id }, p.nome + (p.ativo ? '' : ' (inativa)'))));
    const add = el('button', { class: 'btn small', type: 'submit', disabled: !fora.length }, 'Incluir');
    const form = el('form', { class: 'row', style: 'margin-top:8px' }, sel, add);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!sel.value) return;
      executar(add, async () => {
        const { error } = await sb.from('pagamentos').insert({ mes_id: mes.id, pessoa_id: sel.value });
        if (error) throw error;
      }, 'Pessoa incluída no mês');
    });

    const ordenada = [...lista].sort((a, b) => nomePessoa(a.pessoa_id).localeCompare(nomePessoa(b.pessoa_id), 'pt-BR'));
    return el('div', { style: 'margin:10px 0 4px; padding:10px 12px; background:var(--bg); border-radius:10px' },
      el('ul', { class: 'list-plain' }, ordenada.map((pag) => el('li', {},
        el('span', { class: 'grow' }, STATUS[pag.status].icone, ' ', nomePessoa(pag.pessoa_id)),
        el('span', { class: 'small muted' }, STATUS[pag.status].texto),
        el('button', {
          class: 'btn link small',
          onclick: (ev) => executar(ev.currentTarget, async () => {
            if (pag.status !== 'pendente' && !confirm('Esta pessoa já enviou comprovante. Remover mesmo assim?')) return false;
            const { error } = await sb.from('pagamentos').delete().eq('id', pag.id);
            if (error) throw error;
            await removerArquivos('comprovantes', [pag.comprovante_path]);
          }, 'Pessoa removida do mês'),
        }, 'Remover')))),
      lista.length ? null : el('p', { class: 'muted small' }, 'Lista vazia.'),
      form);
  }

  // ---------- Zona de perigo ----------
  function secaoExcluir() {
    return el('section', { class: 'card' },
      el('h2', { style: 'margin-bottom:8px' }, 'Excluir campanha'),
      el('p', { class: 'small muted' }, 'Apaga a campanha, as pessoas, os meses e todos os comprovantes.'),
      el('button', {
        class: 'btn danger',
        onclick: (ev) => ocupado(ev.currentTarget, async () => {
          if (prompt(`Para confirmar, digite o endereço da campanha: ${campanha.slug}`) !== campanha.slug) return;
          try {
            const { error } = await sb.from('campanhas').delete().eq('id', campanha.id);
            if (error) throw error;
            await removerArquivos('comprovantes', pagamentos.map((p) => p.comprovante_path));
            await apagarImagemAntiga();
            toast('Campanha excluída');
            location.hash = '#/admin';
          } catch (e) { erro(e); }
        }),
      }, 'Excluir campanha'));
  }

  function desenhar() {
    render(
      el('div', { class: 'topbar' },
        el('a', { href: '#/admin' }, '← Campanhas'),
        el('a', { class: 'btn secondary small', href: `#/c/${campanha.slug}` }, 'Ver página da campanha')),
      el('header', { class: 'campaign-header' }, avatar(campanha), el('h1', {}, campanha.nome)),
      secaoMeses(),
      secaoPessoas(),
      secaoDados(),
      secaoExcluir(),
    );
  }

  await carregar();
  desenhar();
}
