/* =============================================================================
   SF PARFUMS — admin.js
   Painel administrativo: login, dashboard, cadastro de estilos e perfumes,
   edição rápida de preços/imagens/descrições e backup.

   Tudo o que é salvo aqui passa pela camada DB (js/dados.js), que é a mesma
   que a loja pública lê. Por isso qualquer alteração aparece na loja na hora,
   sem editar código.
============================================================================= */
'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const ADM = {
  tela: 'dashboard',
  busca: '',
  filtroEstilo: 'todos',
  filtroStatus: 'todos',
  fotoPrincipal: '',
  fotosExtras: [],
  capaEstilo: '',
  modais: {},
  aoConfirmar: null
};

/* ===========================================================================
   UTILITÁRIOS
=========================================================================== */
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Aceita "189,90", "R$ 189,90", "1.189,90" e "189.90". */
function lerPreco(valor) {
  if (typeof valor === 'number') return valor;
  const limpo = String(valor || '').replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function toast(msg, tipo = '', icone = '') {
  const caixa = $('#toasts');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = `toast-sf ${tipo}`.trim();
  el.setAttribute('role', 'status');
  el.innerHTML = `${icone ? `<span class="ic">${icone}</span>` : ''}<span>${esc(msg)}</span>`;
  caixa.appendChild(el);
  setTimeout(() => {
    el.classList.add('saindo');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3000);
}

function marcarErro(seletor, mensagem) {
  const campo = $(seletor)?.closest('.campo');
  if (!campo) return;
  campo.classList.add('invalido');
  const msg = campo.querySelector('.erro-msg');
  if (msg && mensagem) msg.textContent = mensagem;
}

const limparErros = ctx => $$('.campo.invalido', ctx || document).forEach(c => c.classList.remove('invalido'));

/** Confirmação antes de ações destrutivas. */
function confirmar({ titulo, texto, icone = '⚠️', rotulo = 'Confirmar', perigo = false }, aoAceitar) {
  $('#tituloConfirma').textContent = titulo;
  $('#textoConfirma').innerHTML = texto;
  $('#icConfirma').textContent = icone;
  const btn = $('#btnConfirmar');
  btn.textContent = rotulo;
  btn.classList.toggle('btn-ouro', !perigo);
  btn.classList.toggle('btn-neutro', perigo);
  ADM.aoConfirmar = aoAceitar;
  ADM.modais.confirma.show();
}

function placeholderThumb() {
  return `<svg viewBox="0 0 120 70" aria-hidden="true"><use href="#monograma"></use></svg>`;
}

/* ===========================================================================
   TEMA
=========================================================================== */
function iniciarTema() {
  const CHAVE = 'sf_parfums_tema';
  const aplicar = t => {
    document.documentElement.setAttribute('data-tema', t);
    $('#iconeTema')?.querySelector('use')?.setAttribute('href', t === 'escuro' ? '#ic-sol' : '#ic-lua');
  };
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE); } catch (e) { /* ignora */ }
  aplicar(salvo || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));
  $('#btnTema')?.addEventListener('click', () => {
    const novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    try { localStorage.setItem(CHAVE, novo); } catch (e) { /* ignora */ }
  });
}

/* ===========================================================================
   LOGIN
   A senha nunca é guardada em texto: comparamos o hash SHA-256.
   Isso impede leitura casual, mas não resiste a quem inspeciona o código —
   proteção real exige validação em servidor (documentado no README).
=========================================================================== */
const SESSAO = 'sf_parfums_sessao';
const SENHA_LOCAL = 'sf_parfums_senha';

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const buf = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Hash válido: o do arquivo, ou o definido pelo administrador neste aparelho. */
function hashEsperado() {
  try {
    const local = localStorage.getItem(SENHA_LOCAL);
    if (local) return local;
  } catch (e) { /* ignora */ }
  return LOJA.admin.senhaHash;
}

function sessaoValida() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSAO) || 'null');
    return !!s && Date.now() < s.expira;
  } catch (e) { return false; }
}

function abrirSessao() {
  const minutos = Number(LOJA.admin.minutosSessao) || 120;
  try {
    sessionStorage.setItem(SESSAO, JSON.stringify({ expira: Date.now() + minutos * 60000 }));
  } catch (e) { /* ignora */ }
}

function encerrarSessao() {
  try { sessionStorage.removeItem(SESSAO); } catch (e) { /* ignora */ }
  location.reload();
}

async function tentarLogin(ev) {
  ev.preventDefault();
  const usuario = $('#inUsuario').value.trim();
  const senha = $('#inSenha').value;
  const erro = $('#erroLogin');
  const mostrarErro = txt => { $('#erroLoginTexto').textContent = txt; erro.hidden = false; };
  erro.hidden = true;

  if (!usuario || !senha) { mostrarErro('Preencha o usuário e a senha para continuar.'); return; }

  const hash = await sha256(senha);
  if (usuario.toLowerCase() !== String(LOJA.admin.usuario).toLowerCase() || hash !== hashEsperado()) {
    mostrarErro('Usuário ou senha incorretos. Tente novamente.');
    $('#inSenha').value = '';
    $('#inSenha').focus();
    return;
  }

  abrirSessao();
  await entrarNoPainel();
}

async function entrarNoPainel() {
  $('#telaLogin').hidden = true;
  $('#painel').hidden = false;
  await DB.iniciar();
  DB.aoMudar(() => renderTudo());
  renderTudo();
  toast('Bem-vindo ao painel!', 'sucesso', '👋');
}

/* ===========================================================================
   NAVEGAÇÃO ENTRE TELAS
=========================================================================== */
const TITULOS = {
  dashboard:  ['Dashboard', 'Visão geral da sua loja.'],
  produtos:   ['Perfumes', 'Todos os perfumes cadastrados.'],
  estilos:    ['Estilos', 'As categorias que organizam a loja.'],
  precos:     ['Gerenciar preços', 'Altere vários preços de uma vez.'],
  imagens:    ['Gerenciar imagens', 'Troque as fotos dos perfumes.'],
  descricoes: ['Gerenciar descrições', 'Escreva os textos que o cliente lê.'],
  config:     ['Configurações', 'Senha, backup e armazenamento.']
};

function irPara(tela) {
  if (!TITULOS[tela]) return;
  ADM.tela = tela;
  $$('.tela').forEach(s => s.classList.toggle('ativa', s.dataset.tela === tela));
  $$('.item-menu[data-tela]').forEach(b => b.classList.toggle('ativo', b.dataset.tela === tela));
  const [t, sub] = TITULOS[tela];
  $('#tituloTela').textContent = t;
  $('#subtituloTela').textContent = sub;
  fecharLateral();
  renderTela(tela);
  $('.corpo-painel')?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const abrirLateral  = () => { $('#lateral').classList.add('aberta'); $('#veuLateral').classList.add('ativo'); };
const fecharLateral = () => { $('#lateral').classList.remove('aberta'); $('#veuLateral').classList.remove('ativo'); };

/* ===========================================================================
   DASHBOARD
=========================================================================== */
function renderDashboard() {
  const todos = DB.todosProdutos();
  const publicados = todos.filter(p => p.ativo);
  const ocultos = todos.filter(p => !p.ativo);
  const esgotados = todos.filter(p => p.estoque === false);
  const emPromo = todos.filter(p => DB.emPromocao(p));
  const cats = DB.todasCategorias();
  const valorEstoque = publicados.reduce((s, p) => s + DB.precoFinal(p), 0);

  $('#cartoesDashboard').innerHTML = `
    <div class="cartao ok"><span class="rot">Publicados</span><div class="num">${publicados.length}</div><div class="obs">visíveis para o cliente</div></div>
    <div class="cartao"><span class="rot">Estilos ativos</span><div class="num">${cats.filter(c => c.ativo).length}</div><div class="obs">de ${cats.length} cadastrados</div></div>
    <div class="cartao ${ocultos.length ? 'alerta' : ''}"><span class="rot">Ocultos</span><div class="num">${ocultos.length}</div><div class="obs">não aparecem na loja</div></div>
    <div class="cartao ${esgotados.length ? 'alerta' : ''}"><span class="rot">Esgotados</span><div class="num">${esgotados.length}</div><div class="obs">marcados sem estoque</div></div>
    <div class="cartao"><span class="rot">Em promoção</span><div class="num">${emPromo.length}</div><div class="obs">com preço promocional</div></div>
    <div class="cartao"><span class="rot">Soma dos preços</span><div class="num" style="font-size:1.5rem">${brl(valorEstoque)}</div><div class="obs">itens publicados</div></div>`;

  // Itens que merecem atenção
  const problemas = [];
  todos.forEach(p => {
    const faltas = [];
    if (!p.imagem) faltas.push('sem foto');
    if (!p.descricao) faltas.push('sem descrição');
    if (!DB.precoFinal(p)) faltas.push('sem preço');
    if (!DB.categoriaPorSlug(p.categoria)) faltas.push('estilo inexistente');
    if (p.quantidade != null && p.quantidade <= 2) faltas.push(`só ${p.quantidade} em estoque`);
    if (faltas.length) problemas.push({ p, motivo: faltas.join(' · ') });
  });

  $('#listaAtencao').innerHTML = problemas.length
    ? problemas.slice(0, 12).map(({ p, motivo }) => `
        <div class="linha-atencao">
          <span class="nm">${esc(p.nome || 'Sem nome')}</span>
          <span class="motivo">${esc(motivo)}</span>
          <button type="button" class="btn btn-contorno btn-sm" data-editar="${esc(p.id)}">Editar</button>
        </div>`).join('')
      + (problemas.length > 12 ? `<p class="motivo" style="padding-top:12px">e mais ${problemas.length - 12} item(ns).</p>` : '')
    : `<div class="linha-atencao"><span class="motivo">✅ Nenhum problema encontrado. Seu catálogo está completo.</span></div>`;

  // Distribuição por estilo
  const maior = Math.max(1, ...cats.map(c => todos.filter(p => p.categoria === c.slug).length));
  $('#resumoEstilos').innerHTML = cats.length ? cats.map(c => {
    const n = todos.filter(p => p.categoria === c.slug).length;
    return `<div class="barra-estilo">
      <div class="cima"><b>${esc(c.icone)} ${esc(c.nome)}</b><span>${n} perfume(s)${c.ativo ? '' : ' · estilo inativo'}</span></div>
      <div class="trilha"><div class="preenche" style="width:${Math.round(n / maior * 100)}%"></div></div>
    </div>`;
  }).join('') : '<p class="motivo">Nenhum estilo cadastrado ainda.</p>';
}

/* ===========================================================================
   TABELA DE PERFUMES
=========================================================================== */
function produtosFiltrados() {
  const termo = ADM.busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return DB.todosProdutos().filter(p => {
    if (ADM.filtroEstilo !== 'todos' && p.categoria !== ADM.filtroEstilo) return false;
    if (ADM.filtroStatus === 'publicado' && !p.ativo) return false;
    if (ADM.filtroStatus === 'oculto' && p.ativo) return false;
    if (ADM.filtroStatus === 'esgotado' && p.estoque !== false) return false;
    if (!termo) return true;
    const alvo = `${p.nome} ${p.marca}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return alvo.includes(termo);
  });
}

function renderProdutos() {
  const alvo = $('#tabelaProdutos');
  const lista = produtosFiltrados();
  const total = DB.todosProdutos().length;

  if (total === 0) {
    alvo.innerHTML = `<div class="nada">
      <span class="ic">🧴</span><h3>Nenhum perfume cadastrado</h3>
      <p>Comece adicionando o primeiro perfume da loja.</p>
      <button type="button" class="btn btn-ouro" data-acao="novo-produto">Adicionar perfume</button>
    </div>`;
    return;
  }
  if (lista.length === 0) {
    alvo.innerHTML = `<div class="nada">
      <span class="ic">🔎</span><h3>Nada encontrado</h3>
      <p>Nenhum perfume corresponde à busca ou aos filtros escolhidos.</p>
      <button type="button" class="btn btn-contorno" id="limparFiltrosAdm">Limpar filtros</button>
    </div>`;
    return;
  }

  alvo.innerHTML = `<div class="tabela-cerca"><div class="rolagem-x"><table class="adm">
    <thead><tr>
      <th>Perfume</th><th>Estilo</th><th>Preço</th><th>Situação</th><th style="text-align:right">Ações</th>
    </tr></thead>
    <tbody>${lista.map(p => {
      const cat = DB.categoriaPorSlug(p.categoria);
      const riscado = DB.precoRiscado(p);
      return `<tr class="${p.ativo ? '' : 'oculta'}">
        <td>
          <div class="cel-produto">
            <div class="mini-thumb">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : placeholderThumb()}</div>
            <div class="txt">
              <div class="nm">${esc(p.nome || 'Sem nome')}</div>
              ${p.marca || p.volume ? `<div class="mc">${esc([p.marca, p.volume].filter(Boolean).join(' · '))}</div>` : ''}
            </div>
          </div>
        </td>
        <td data-rot="Estilo">${cat ? `${esc(cat.icone)} ${esc(cat.nome)}` : '<span class="etiqueta esgotado">estilo removido</span>'}</td>
        <td class="cel-preco" data-rot="Preço">
          <span class="vend">${brl(DB.precoFinal(p))}</span>
          ${riscado ? `<span class="risc">${brl(riscado)}</span>` : ''}
        </td>
        <td data-rot="Situação">
          ${p.ativo ? '<span class="etiqueta pub">Publicado</span>' : '<span class="etiqueta oculto">Oculto</span>'}
          ${p.estoque === false ? ' <span class="etiqueta esgotado">Esgotado</span>' : ''}
        </td>
        <td class="cel-acoes">
          <div class="acoes-linha">
            <button type="button" class="bt-acao" data-editar="${esc(p.id)}" title="Editar" aria-label="Editar ${esc(p.nome)}"><svg><use href="#ic-lapis"></use></svg></button>
            <button type="button" class="bt-acao" data-duplicar="${esc(p.id)}" title="Duplicar" aria-label="Duplicar ${esc(p.nome)}"><svg><use href="#ic-copia"></use></svg></button>
            <button type="button" class="bt-acao" data-alternar="${esc(p.id)}" title="${p.ativo ? 'Ocultar da loja' : 'Publicar na loja'}" aria-label="${p.ativo ? 'Ocultar' : 'Publicar'} ${esc(p.nome)}">
              <svg><use href="#${p.ativo ? 'ic-olho' : 'ic-olho-off'}"></use></svg></button>
            <button type="button" class="bt-acao excluir" data-excluir="${esc(p.id)}" title="Excluir" aria-label="Excluir ${esc(p.nome)}"><svg><use href="#ic-lixo"></use></svg></button>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <div class="pe-tabela"><span class="conta-txt">Mostrando ${lista.length} de ${total} perfume(s)</span></div>
  </div>`;
}

/* ===========================================================================
   ESTILOS
=========================================================================== */
function renderEstilos() {
  const cats = DB.todasCategorias();
  const alvo = $('#listaEstilos');

  if (cats.length === 0) {
    alvo.innerHTML = `<div class="nada">
      <span class="ic">🏷️</span><h3>Nenhum estilo cadastrado</h3>
      <p>Crie o primeiro estilo, por exemplo: Árabes, Importados ou Nacionais.</p>
      <button type="button" class="btn btn-ouro" data-acao="novo-estilo">Adicionar novo estilo</button>
    </div>`;
    return;
  }

  alvo.innerHTML = `<div class="grade-estilos">${cats.map(c => {
    const n = DB.produtosNaCategoria(c.slug);
    return `<article class="cartao-estilo ${c.ativo ? '' : 'inativo'}">
      ${c.imagem ? `<img class="capa" src="${esc(c.imagem)}" alt="">` : ''}
      <span class="emoji">${esc(c.icone)}</span>
      ${c.chamada ? `<span class="frase">${esc(c.chamada)}</span>` : ''}
      <h3>${esc(c.nome)}</h3>
      <p class="txt">${esc(c.descricao || 'Sem descrição.')}</p>
      <div class="rodape-cartao">
        <span class="qtd">${n} perfume(s)</span>
        ${c.ativo ? '<span class="etiqueta pub">Ativo</span>' : '<span class="etiqueta oculto">Inativo</span>'}
      </div>
      <div class="rodape-cartao">
        <button type="button" class="btn btn-contorno btn-sm" data-editar-estilo="${esc(c.slug)}">Editar</button>
        <button type="button" class="btn btn-contorno btn-sm" data-add-no-estilo="${esc(c.slug)}">+ Perfume</button>
        <button type="button" class="btn btn-neutro btn-sm" data-excluir-estilo="${esc(c.slug)}">Excluir</button>
      </div>
    </article>`;
  }).join('')}</div>`;
}

/* ===========================================================================
   EDIÇÃO RÁPIDA: PREÇOS
=========================================================================== */
function renderPrecos() {
  const lista = DB.todosProdutos();
  const alvo = $('#tabelaPrecos');
  if (!lista.length) { alvo.innerHTML = vazioSemProdutos(); return; }

  alvo.innerHTML = `<div class="tabela-cerca"><div class="rolagem-x"><table class="adm">
    <thead><tr><th>Perfume</th><th>Preço normal</th><th>Preço promocional</th><th>Cliente paga</th></tr></thead>
    <tbody>${lista.map(p => `
      <tr data-id="${esc(p.id)}">
        <td><div class="cel-produto"><div class="mini-thumb">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : placeholderThumb()}</div>
          <div class="txt"><div class="nm">${esc(p.nome)}</div><div class="mc">${esc(DB.categoriaPorSlug(p.categoria)?.nome || '—')}</div></div></div></td>
        <td data-rot="Preço normal"><input type="text" class="entrada-linha" data-campo="preco" inputmode="decimal"
               value="${p.preco ? String(p.preco.toFixed(2)).replace('.', ',') : ''}" placeholder="0,00"></td>
        <td data-rot="Preço promocional"><input type="text" class="entrada-linha" data-campo="precoPromocional" inputmode="decimal"
               value="${p.precoPromocional ? String(p.precoPromocional.toFixed(2)).replace('.', ',') : ''}" placeholder="sem oferta"></td>
        <td class="cel-preco" data-rot="Cliente paga"><span class="vend" data-final>${brl(DB.precoFinal(p))}</span></td>
      </tr>`).join('')}</tbody>
  </table></div>
  <div class="pe-tabela">
    <span class="conta-txt">${lista.length} perfume(s)</span>
    <button type="button" class="btn btn-ouro" id="salvarPrecos">Salvar alterações</button>
  </div></div>`;
}

/* ===========================================================================
   EDIÇÃO RÁPIDA: DESCRIÇÕES
=========================================================================== */
function renderDescricoes() {
  const lista = DB.todosProdutos();
  const alvo = $('#tabelaDescricoes');
  if (!lista.length) { alvo.innerHTML = vazioSemProdutos(); return; }

  alvo.innerHTML = `<div class="tabela-cerca"><div class="rolagem-x"><table class="adm">
    <thead><tr><th style="width:230px">Perfume</th><th>Descrição que o cliente lê</th></tr></thead>
    <tbody>${lista.map(p => `
      <tr data-id="${esc(p.id)}">
        <td><div class="cel-produto"><div class="mini-thumb">${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : placeholderThumb()}</div>
          <div class="txt"><div class="nm">${esc(p.nome)}</div></div></div></td>
        <td data-rot="Descrição"><textarea class="entrada-linha" data-campo="descricao" rows="3"
              placeholder="Conte como é o perfume...">${esc(p.descricao)}</textarea></td>
      </tr>`).join('')}</tbody>
  </table></div>
  <div class="pe-tabela">
    <span class="conta-txt">${lista.length} perfume(s)</span>
    <button type="button" class="btn btn-ouro" id="salvarDescricoes">Salvar alterações</button>
  </div></div>`;
}

/* ===========================================================================
   EDIÇÃO RÁPIDA: IMAGENS
=========================================================================== */
function renderImagens() {
  const lista = DB.todosProdutos();
  const alvo = $('#gradeImagens');
  if (!lista.length) { alvo.innerHTML = vazioSemProdutos(); return; }

  alvo.innerHTML = `<div class="grade-fotos">${lista.map(p => `
    <div class="cartao-foto">
      <div class="quadro">${p.imagem ? `<img src="${esc(p.imagem)}" alt="${esc(p.nome)}">` : placeholderThumb()}</div>
      <div class="baixo">
        <span class="nm">${esc(p.nome)}</span>
        <span class="peso">${p.imagem
          ? (p.imagem.startsWith('data:') ? `${DB.pesoImagemKB(p.imagem)} KB` : 'endereço da internet')
          : 'sem foto'}</span>
        <button type="button" class="btn btn-contorno btn-sm" data-trocar-foto="${esc(p.id)}">
          ${p.imagem ? 'Alterar foto' : 'Adicionar foto'}
        </button>
      </div>
    </div>`).join('')}</div>
  <input type="file" id="arquivoTroca" accept="image/*" hidden>`;
}

const vazioSemProdutos = () => `<div class="nada">
  <span class="ic">🧴</span><h3>Nenhum perfume cadastrado</h3>
  <p>Cadastre um perfume primeiro para poder editar por aqui.</p>
  <button type="button" class="btn btn-ouro" data-acao="novo-produto">Adicionar perfume</button>
</div>`;

/* ===========================================================================
   CONFIGURAÇÕES
=========================================================================== */
function renderConfig() {
  const firebase = DB.modo === 'firebase';
  $('#infoArmazenamento').innerHTML = firebase
    ? `<div class="alerta-box ok"><span class="ic">✅</span><div>
         <b>Publicação automática ativa.</b><br>
         Os dados estão no servidor (Firebase). Tudo que você publica aparece na hora
         para todos os clientes, em qualquer aparelho.
       </div></div>`
    : `<div class="alerta-box aviso"><span class="ic">⚠️</span><div>
         <b>Salvando apenas neste aparelho.</b><br>
         As alterações funcionam e ficam guardadas aqui, mas <b>os clientes ainda não
         as veem</b>. Para publicar para todos, preencha a configuração do Firebase em
         <code>js/produtos.js</code> — o passo a passo está no README.
       </div></div>`;
}

/* ===========================================================================
   FORMULÁRIO DE PERFUME
=========================================================================== */
function preencherSelectEstilos() {
  const cats = DB.todasCategorias();
  const sel = $('#prodCategoria');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Escolha o estilo...</option>'
      + cats.map(c => `<option value="${esc(c.slug)}">${esc(c.nome)}${c.ativo ? '' : ' (inativo)'}</option>`).join('');
    if (atual) sel.value = atual;
  }
  const filtro = $('#filtroEstilo');
  if (filtro) {
    const atual = filtro.value || 'todos';
    filtro.innerHTML = '<option value="todos">Todos os estilos</option>'
      + cats.map(c => `<option value="${esc(c.slug)}">${esc(c.nome)}</option>`).join('');
    filtro.value = atual;
  }
}

function abrirFormProduto(id = null, categoriaSugerida = '') {
  limparErros($('#formProduto'));
  preencherSelectEstilos();
  const p = id ? DB.produtoPorId(id) : null;

  $('#tituloModalProduto').textContent = p ? 'Editar perfume' : 'Adicionar perfume';
  $('#subModalProduto').textContent = p
    ? 'As alterações aparecem na loja assim que você salvar.'
    : 'Preencha as informações e clique em Publicar.';
  $('#btnPublicarProduto').textContent = p ? 'Salvar alterações' : 'Publicar na loja';
  $('#btnSalvarRascunho').hidden = !!p;

  $('#prodId').value = p?.id || '';
  $('#prodNome').value = p?.nome || '';
  $('#prodMarca').value = p?.marca || '';
  $('#prodCategoria').value = p?.categoria || categoriaSugerida || '';
  $('#prodPreco').value = p?.preco ? String(p.preco.toFixed(2)).replace('.', ',') : '';
  $('#prodPromo').value = p?.precoPromocional ? String(p.precoPromocional.toFixed(2)).replace('.', ',') : '';
  $('#prodDescricao').value = p?.descricao || '';
  $('#prodNotas').value = p?.notas || '';
  $('#prodGenero').value = p?.genero || '';
  $('#prodVolume').value = p?.volume || '';
  $('#prodQuantidade').value = p?.quantidade ?? '';
  $('#prodEstoque').value = p && p.estoque === false ? 'nao' : 'sim';
  $('#prodAtivo').value = p && p.ativo === false ? 'nao' : 'sim';
  $('#prodDestaque').checked = !!p?.destaque;
  $('#prodImagemUrl').value = '';
  $('#erroFoto').textContent = '';

  ADM.fotoPrincipal = p?.imagem || '';
  ADM.fotosExtras = [...(p?.imagensExtras || [])];
  renderPreviaFoto();
  renderExtras();
  atualizarPrevia();
  ADM.modais.produto.show();
}

function renderPreviaFoto() {
  const box = $('#previaPrincipal');
  if (ADM.fotoPrincipal) {
    box.classList.add('tem');
    box.innerHTML = `<img src="${esc(ADM.fotoPrincipal)}" alt="Pré-visualização da foto">`;
    $('#rotuloBtnFoto').textContent = 'Alterar foto';
    $('#btnRemoverFoto').hidden = false;
  } else {
    box.classList.remove('tem');
    box.innerHTML = 'Nenhuma foto escolhida';
    $('#rotuloBtnFoto').textContent = 'Escolher foto';
    $('#btnRemoverFoto').hidden = true;
  }
}

function renderExtras() {
  $('#tiraExtras').innerHTML = ADM.fotosExtras.map((src, i) => `
    <div class="extra-item">
      <img src="${esc(src)}" alt="Foto adicional ${i + 1}">
      <button type="button" data-remover-extra="${i}" aria-label="Remover foto adicional ${i + 1}">&times;</button>
    </div>`).join('');
}

/** Monta o objeto do produto a partir do formulário. */
function lerFormProduto() {
  return {
    id: $('#prodId').value || null,
    nome: $('#prodNome').value.trim(),
    marca: $('#prodMarca').value.trim(),
    categoria: $('#prodCategoria').value,
    preco: lerPreco($('#prodPreco').value),
    precoPromocional: $('#prodPromo').value.trim() ? lerPreco($('#prodPromo').value) : 0,
    volume: $('#prodVolume').value.trim(),
    genero: $('#prodGenero').value,
    notas: $('#prodNotas').value.trim(),
    descricao: $('#prodDescricao').value.trim(),
    imagem: ADM.fotoPrincipal,
    imagensExtras: [...ADM.fotosExtras],
    quantidade: $('#prodQuantidade').value.trim() === '' ? null : Number($('#prodQuantidade').value),
    estoque: $('#prodEstoque').value === 'sim',
    ativo: $('#prodAtivo').value === 'sim',
    destaque: $('#prodDestaque').checked
  };
}

/** Card idêntico ao da loja, para o administrador conferir antes de publicar. */
function atualizarPrevia() {
  const d = lerFormProduto();
  const cat = DB.categoriaPorSlug(d.categoria);
  const promo = d.precoPromocional > 0 && d.precoPromocional < d.preco;
  const valor = promo ? d.precoPromocional : (d.preco || 0);

  $('#previaCard').innerHTML = `
    <article class="card-prod">
      <div class="moldura">
        ${promo ? '<span class="selo oferta">Oferta</span>' : ''}
        ${!d.estoque ? '<span class="selo esgotado">Esgotado</span>' : ''}
        ${d.imagem
          ? `<img src="${esc(d.imagem)}" alt="">`
          : `<span class="placeholder-marca"><svg viewBox="0 0 120 70"><use href="#monograma"></use></svg><span>SF Parfums</span></span>`}
      </div>
      <div class="info">
        <span class="cat">${esc(cat?.nome || 'Escolha um estilo')}</span>
        <h3>${esc(d.nome || 'Nome do perfume')}</h3>
        ${d.volume ? `<span class="vol">${esc(d.volume)}</span>` : ''}
        <div class="precos">
          <span class="preco">${brl(valor)}</span>
          ${promo ? `<span class="preco-antigo">${brl(d.preco)}</span>` : ''}
        </div>
        <div class="acoes-card">
          <button type="button" class="btn btn-contorno" disabled>Detalhes</button>
          <span class="btn-add-rapido"><svg viewBox="0 0 24 24"><use href="#ic-mais"></use></svg></span>
        </div>
      </div>
    </article>`;
  $('#avisoPreviaOculto').hidden = d.ativo;
}

function validarProduto(d) {
  limparErros($('#formProduto'));
  let ok = true;

  if (d.nome.length < 2) { marcarErro('#prodNome', 'Informe o nome do perfume.'); ok = false; }
  if (!d.categoria) { marcarErro('#prodCategoria', 'Escolha o estilo do perfume.'); ok = false; }
  if (!Number.isFinite(d.preco) || d.preco <= 0) {
    marcarErro('#prodPreco', 'Informe um preço válido, por exemplo 189,90.'); ok = false;
  }
  if ($('#prodPromo').value.trim() && (!Number.isFinite(d.precoPromocional) || d.precoPromocional <= 0)) {
    marcarErro('#prodPromo', 'Preço promocional inválido. Deixe vazio se não houver oferta.'); ok = false;
  } else if (d.precoPromocional > 0 && Number.isFinite(d.preco) && d.precoPromocional >= d.preco) {
    marcarErro('#prodPromo', 'O preço promocional precisa ser menor que o normal.'); ok = false;
  }
  if (!d.imagem) { $('#erroFoto').textContent = 'Escolha a foto principal do perfume.'; ok = false; }
  else { $('#erroFoto').textContent = ''; }

  if (d.nome.length >= 2 && d.categoria && DB.nomeDuplicado(d.nome, d.categoria, d.id)) {
    marcarErro('#prodNome', 'Já existe um perfume com este nome neste estilo.'); ok = false;
  }

  if (!ok) {
    toast('Preencha os campos obrigatórios antes de continuar.', 'erro', '⚠️');
    $('.campo.invalido', $('#formProduto'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return ok;
}

async function salvarProduto(publicar) {
  const d = lerFormProduto();
  if (!publicar) d.ativo = false;
  if (!validarProduto(d)) return;

  const novo = !d.id;
  try {
    await DB.salvarProduto(d);
    toast(novo ? 'Perfume cadastrado com sucesso!' : 'Alterações salvas com sucesso!', 'sucesso', '✅');
    ADM.modais.produto.hide();
    renderTudo();
  } catch (e) {
    console.error(e);
    toast('Não foi possível salvar. Se o aviso continuar, use fotos menores.', 'erro', '⚠️');
  }
}

/* ===========================================================================
   FORMULÁRIO DE ESTILO
=========================================================================== */
function abrirFormEstilo(slug = null) {
  limparErros($('#formEstilo'));
  const c = slug ? DB.categoriaPorSlug(slug) : null;
  $('#tituloModalEstilo').textContent = c ? 'Editar estilo' : 'Novo estilo';
  $('#estiloSlug').value = c?.slug || '';
  $('#estiloNome').value = c?.nome || '';
  $('#estiloIcone').value = c?.icone || '✨';
  $('#estiloChamada').value = c?.chamada || '';
  $('#estiloDescricao').value = c?.descricao || '';
  $('#estiloAtivo').value = c && c.ativo === false ? 'nao' : 'sim';
  ADM.capaEstilo = c?.imagem || '';
  renderPreviaCapa();
  ADM.modais.estilo.show();
}

function renderPreviaCapa() {
  const box = $('#previaEstilo');
  if (ADM.capaEstilo) {
    box.classList.add('tem');
    box.innerHTML = `<img src="${esc(ADM.capaEstilo)}" alt="Capa do estilo">`;
    $('#btnRemoverCapa').hidden = false;
  } else {
    box.classList.remove('tem');
    box.innerHTML = 'Sem capa';
    $('#btnRemoverCapa').hidden = true;
  }
}

async function salvarEstilo() {
  limparErros($('#formEstilo'));
  const nome = $('#estiloNome').value.trim();
  const slugAtual = $('#estiloSlug').value;

  if (nome.length < 2) {
    marcarErro('#estiloNome', 'Informe o nome do estilo.');
    toast('Preencha os campos obrigatórios antes de continuar.', 'erro', '⚠️');
    return;
  }
  const slug = slugAtual || DB.gerarSlug(nome);
  if (!slugAtual && DB.categoriaPorSlug(slug)) {
    marcarErro('#estiloNome', 'Já existe um estilo com este nome.');
    toast('Já existe um estilo com este nome.', 'erro', '⚠️');
    return;
  }

  try {
    await DB.salvarCategoria({
      slug,
      nome,
      icone: $('#estiloIcone').value.trim() || '✦',
      chamada: $('#estiloChamada').value.trim(),
      descricao: $('#estiloDescricao').value.trim(),
      imagem: ADM.capaEstilo,
      ativo: $('#estiloAtivo').value === 'sim'
    });
    toast(slugAtual ? 'Estilo atualizado com sucesso!' : `Estilo "${nome}" criado e já está na loja!`, 'sucesso', '✅');
    ADM.modais.estilo.hide();
    renderTudo();
  } catch (e) {
    console.error(e);
    toast('Não foi possível salvar o estilo.', 'erro', '⚠️');
  }
}

/* ===========================================================================
   IMAGENS: escolher arquivo e comprimir
=========================================================================== */
async function escolherImagem(input, aoPronto) {
  const arquivo = input.files?.[0];
  if (!arquivo) return;
  try {
    toast('Preparando a imagem...', '', '⏳');
    const dataUrl = await DB.comprimirImagem(arquivo);
    const kb = DB.pesoImagemKB(dataUrl);
    if (kb > 800) {
      toast(`A imagem ficou grande (${kb} KB). Prefira fotos mais leves.`, 'erro', '⚠️');
    }
    aoPronto(dataUrl);
  } catch (e) {
    toast(e.message || 'Não foi possível usar esta imagem.', 'erro', '⚠️');
  } finally {
    input.value = '';
  }
}

/* ===========================================================================
   RENDER GERAL
=========================================================================== */
function renderTela(tela) {
  ({
    dashboard: renderDashboard,
    produtos: renderProdutos,
    estilos: renderEstilos,
    precos: renderPrecos,
    imagens: renderImagens,
    descricoes: renderDescricoes,
    config: renderConfig
  }[tela] || (() => {}))();
}

function renderTudo() {
  $('#contaProdutos').textContent = DB.todosProdutos().length;
  $('#contaEstilos').textContent = DB.todasCategorias().length;
  const firebase = DB.modo === 'firebase';
  $('#statusDados').innerHTML = firebase
    ? `<span class="bolinha on"></span><b>Publicação automática</b><br>Alterações vão para todos os clientes.`
    : `<span class="bolinha off"></span><b>Somente neste aparelho</b><br>Configure o Firebase para publicar a todos.`;
  preencherSelectEstilos();
  renderTela(ADM.tela);
}

/* ===========================================================================
   EVENTOS
=========================================================================== */
function ligarEventos() {
  // ---- login
  $('#formLogin').addEventListener('submit', tentarLogin);
  $('#verSenha').addEventListener('click', () => {
    const campo = $('#inSenha');
    const vendo = campo.type === 'text';
    campo.type = vendo ? 'password' : 'text';
    $('#verSenha').querySelector('use').setAttribute('href', vendo ? '#ic-olho' : '#ic-olho-off');
  });
  $('#btnSair').addEventListener('click', () => confirmar({
    titulo: 'Sair do painel?', texto: 'Você precisará entrar com a senha novamente.',
    icone: '👋', rotulo: 'Sair'
  }, encerrarSessao));

  // ---- navegação
  $('#abrirLateral').addEventListener('click', abrirLateral);
  $('#fecharLateral').addEventListener('click', fecharLateral);
  $('#veuLateral').addEventListener('click', fecharLateral);

  document.addEventListener('click', ev => {
    const menu = ev.target.closest('[data-tela]');
    if (menu && menu.tagName === 'BUTTON') { irPara(menu.dataset.tela); return; }

    const acao = ev.target.closest('[data-acao]');
    if (acao) {
      if (acao.dataset.acao === 'novo-produto') abrirFormProduto();
      if (acao.dataset.acao === 'novo-estilo') abrirFormEstilo();
      return;
    }

    // ---- ações de produto
    const ed = ev.target.closest('[data-editar]');
    if (ed) { abrirFormProduto(ed.dataset.editar); return; }

    const dup = ev.target.closest('[data-duplicar]');
    if (dup) {
      const p = DB.produtoPorId(dup.dataset.duplicar);
      confirmar({
        titulo: 'Duplicar perfume?', icone: '📋', rotulo: 'Duplicar',
        texto: `Vamos criar uma cópia de <b>${esc(p?.nome || '')}</b>. Ela nasce <b>oculta</b>, para você ajustar antes de publicar.`
      }, async () => {
        const novo = await DB.duplicarProduto(dup.dataset.duplicar);
        toast('Cópia criada. Ela está oculta até você publicar.', 'sucesso', '📋');
        renderTudo();
        if (novo) abrirFormProduto(novo.id);
      });
      return;
    }

    const alt = ev.target.closest('[data-alternar]');
    if (alt) {
      const p = DB.produtoPorId(alt.dataset.alternar);
      if (!p) return;
      DB.alternarAtivo(p.id).then(() => {
        toast(p.ativo ? 'Perfume ocultado — clientes não veem mais.' : 'Perfume publicado na loja!', 'sucesso', p.ativo ? '🙈' : '✅');
        renderTudo();
      });
      return;
    }

    const exc = ev.target.closest('[data-excluir]');
    if (exc) {
      const p = DB.produtoPorId(exc.dataset.excluir);
      confirmar({
        titulo: 'Excluir este perfume?', icone: '🗑️', rotulo: 'Sim, excluir', perigo: true,
        texto: `<b>${esc(p?.nome || '')}</b> será apagado definitivamente da loja.<br><br>Se você só quer tirá-lo do ar por um tempo, use <b>Ocultar</b> em vez de excluir.`
      }, async () => {
        await DB.excluirProduto(exc.dataset.excluir);
        toast('Perfume excluído.', 'sucesso', '🗑️');
        renderTudo();
      });
      return;
    }

    // ---- ações de estilo
    const edEst = ev.target.closest('[data-editar-estilo]');
    if (edEst) { abrirFormEstilo(edEst.dataset.editarEstilo); return; }

    const addNo = ev.target.closest('[data-add-no-estilo]');
    if (addNo) { abrirFormProduto(null, addNo.dataset.addNoEstilo); return; }

    const excEst = ev.target.closest('[data-excluir-estilo]');
    if (excEst) {
      const slug = excEst.dataset.excluirEstilo;
      const c = DB.categoriaPorSlug(slug);
      const n = DB.produtosNaCategoria(slug);
      if (n > 0) {
        confirmar({
          titulo: 'Este estilo tem perfumes', icone: '⚠️', rotulo: 'Entendi',
          texto: `<b>${esc(c?.nome || '')}</b> tem <b>${n} perfume(s)</b>. Mova ou exclua esses perfumes antes de apagar o estilo.<br><br>Para tirá-lo da loja sem apagar nada, edite o estilo e marque como <b>Inativo</b>.`
        }, () => {});
        return;
      }
      confirmar({
        titulo: 'Excluir este estilo?', icone: '🗑️', rotulo: 'Sim, excluir', perigo: true,
        texto: `<b>${esc(c?.nome || '')}</b> será removido da loja e do menu.`
      }, async () => {
        await DB.excluirCategoria(slug);
        toast('Estilo excluído.', 'sucesso', '🗑️');
        renderTudo();
      });
      return;
    }

    // ---- limpar filtros
    if (ev.target.closest('#limparFiltrosAdm')) {
      ADM.busca = ''; ADM.filtroEstilo = 'todos'; ADM.filtroStatus = 'todos';
      $('#buscaAdmin').value = ''; $('#filtroEstilo').value = 'todos'; $('#filtroStatus').value = 'todos';
      renderProdutos();
      return;
    }

    // ---- salvar preços
    if (ev.target.closest('#salvarPrecos')) { salvarPrecosEmLote(); return; }
    if (ev.target.closest('#salvarDescricoes')) { salvarDescricoesEmLote(); return; }

    // ---- trocar foto pela tela de imagens
    const troca = ev.target.closest('[data-trocar-foto]');
    if (troca) {
      const id = troca.dataset.trocarFoto;
      const input = $('#arquivoTroca');
      input.onchange = () => escolherImagem(input, async dataUrl => {
        const p = DB.produtoPorId(id);
        if (!p) return;
        await DB.salvarProduto({ ...p, imagem: dataUrl });
        toast('Foto atualizada — já está na loja!', 'sucesso', '🖼️');
        renderTudo();
      });
      input.click();
      return;
    }
  });

  // ---- confirmação
  $('#btnConfirmar').addEventListener('click', () => {
    const fn = ADM.aoConfirmar;
    ADM.aoConfirmar = null;
    ADM.modais.confirma.hide();
    if (fn) fn();
  });

  // ---- filtros da tabela
  $('#buscaAdmin').addEventListener('input', e => { ADM.busca = e.target.value; renderProdutos(); });
  $('#filtroEstilo').addEventListener('change', e => { ADM.filtroEstilo = e.target.value; renderProdutos(); });
  $('#filtroStatus').addEventListener('change', e => { ADM.filtroStatus = e.target.value; renderProdutos(); });

  // ---- formulário de perfume: pré-visualização ao vivo
  ['#prodNome', '#prodMarca', '#prodCategoria', '#prodPreco', '#prodPromo',
   '#prodVolume', '#prodEstoque', '#prodAtivo'].forEach(sel => {
    $(sel).addEventListener('input', atualizarPrevia);
    $(sel).addEventListener('change', atualizarPrevia);
  });
  $$('#formProduto .campo input, #formProduto .campo select, #formProduto .campo textarea')
    .forEach(el => el.addEventListener('input', () => el.closest('.campo')?.classList.remove('invalido')));

  $('#btnPublicarProduto').addEventListener('click', () => salvarProduto(true));
  $('#btnSalvarRascunho').addEventListener('click', () => salvarProduto(false));
  $('#formProduto').addEventListener('submit', e => { e.preventDefault(); salvarProduto(true); });

  // ---- fotos do perfume
  $('#btnEscolherFoto').addEventListener('click', () => $('#arquivoPrincipal').click());
  $('#arquivoPrincipal').addEventListener('change', e => escolherImagem(e.target, url => {
    ADM.fotoPrincipal = url; $('#erroFoto').textContent = '';
    renderPreviaFoto(); atualizarPrevia();
    toast('Foto carregada. Confira a pré-visualização.', 'sucesso', '🖼️');
  }));
  $('#btnRemoverFoto').addEventListener('click', () => {
    ADM.fotoPrincipal = ''; renderPreviaFoto(); atualizarPrevia();
  });
  $('#btnUsarUrl').addEventListener('click', () => {
    const url = $('#prodImagemUrl').value.trim();
    if (!/^https?:\/\/.+/i.test(url)) { toast('Informe um endereço que comece com http.', 'erro', '⚠️'); return; }
    ADM.fotoPrincipal = url; $('#erroFoto').textContent = '';
    renderPreviaFoto(); atualizarPrevia();
    toast('Endereço aplicado à foto principal.', 'sucesso', '🔗');
  });

  $('#btnAddExtra').addEventListener('click', () => $('#arquivoExtra').click());
  $('#arquivoExtra').addEventListener('change', async e => {
    const arquivos = Array.from(e.target.files || []);
    for (const arq of arquivos.slice(0, 5)) {
      try { ADM.fotosExtras.push(await DB.comprimirImagem(arq)); }
      catch (err) { toast(err.message, 'erro', '⚠️'); }
    }
    e.target.value = '';
    renderExtras();
    toast('Fotos adicionais atualizadas.', 'sucesso', '🖼️');
  });
  $('#tiraExtras').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-remover-extra]');
    if (!btn) return;
    ADM.fotosExtras.splice(Number(btn.dataset.removerExtra), 1);
    renderExtras();
  });

  // ---- formulário de estilo
  $('#btnSalvarEstilo').addEventListener('click', salvarEstilo);
  $('#formEstilo').addEventListener('submit', e => { e.preventDefault(); salvarEstilo(); });
  $('#btnFotoEstilo').addEventListener('click', () => $('#arquivoEstilo').click());
  $('#arquivoEstilo').addEventListener('change', e => escolherImagem(e.target, url => {
    ADM.capaEstilo = url; renderPreviaCapa();
  }));
  $('#btnRemoverCapa').addEventListener('click', () => { ADM.capaEstilo = ''; renderPreviaCapa(); });

  // ---- senha
  $('#formSenha').addEventListener('submit', trocarSenha);
  $('#copiarHash').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#hashNovo').value); toast('Código copiado.', 'sucesso', '📋'); }
    catch (e) { $('#hashNovo').select(); toast('Selecione o texto e copie com Ctrl+C.', '', '📋'); }
  });

  // ---- backup
  $('#btnBaixarBackup').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([DB.exportar()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sf-parfums-catalogo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Cópia de segurança baixada.', 'sucesso', '💾');
  });
  $('#btnRestaurarBackup').addEventListener('click', () => $('#arquivoBackup').click());
  $('#arquivoBackup').addEventListener('change', async e => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    const texto = await arq.text();
    e.target.value = '';
    confirmar({
      titulo: 'Restaurar este arquivo?', icone: '📥', rotulo: 'Restaurar',
      texto: 'O catálogo atual será substituído pelo conteúdo do arquivo escolhido.'
    }, async () => {
      try {
        await DB.importar(texto);
        toast('Catálogo restaurado com sucesso!', 'sucesso', '✅');
        renderTudo();
      } catch (err) {
        toast('Arquivo inválido. Escolha uma cópia baixada por este painel.', 'erro', '⚠️');
      }
    });
  });

  $('#btnResetar').addEventListener('click', () => confirmar({
    titulo: 'Apagar tudo e recomeçar?', icone: '🗑️', rotulo: 'Sim, apagar tudo', perigo: true,
    texto: 'Todos os perfumes e estilos que você cadastrou serão apagados e o catálogo de exemplo volta.<br><br><b>Não há como desfazer.</b> Baixe uma cópia de segurança antes, se quiser.'
  }, async () => {
    await DB.restaurarPadrao();
    toast('Catálogo restaurado ao exemplo inicial.', 'sucesso', '↩️');
    renderTudo();
  }));
}

/* ---------------------------------------------------- salvar em lote */
async function salvarPrecosEmLote() {
  const linhas = $$('#tabelaPrecos tr[data-id]');
  let alterados = 0, invalidos = 0;

  for (const tr of linhas) {
    const p = DB.produtoPorId(tr.dataset.id);
    if (!p) continue;
    const inNormal = $('[data-campo="preco"]', tr);
    const inPromo = $('[data-campo="precoPromocional"]', tr);
    const normal = lerPreco(inNormal.value);
    const promo = inPromo.value.trim() ? lerPreco(inPromo.value) : 0;

    const ruim = !Number.isFinite(normal) || normal <= 0
              || (inPromo.value.trim() && (!Number.isFinite(promo) || promo <= 0 || promo >= normal));
    inNormal.style.borderColor = ruim ? 'var(--erro)' : '';
    inPromo.style.borderColor = ruim ? 'var(--erro)' : '';
    if (ruim) { invalidos++; continue; }

    if (normal !== p.preco || promo !== p.precoPromocional) {
      await DB.salvarProduto({ ...p, preco: normal, precoPromocional: promo });
      alterados++;
    }
  }

  if (invalidos) toast(`${invalidos} preço(s) inválido(s) não foram salvos. O promocional deve ser menor que o normal.`, 'erro', '⚠️');
  if (alterados) { toast(`${alterados} preço(s) atualizado(s) na loja!`, 'sucesso', '✅'); renderTudo(); }
  else if (!invalidos) toast('Nenhuma alteração para salvar.', '', 'ℹ️');
}

async function salvarDescricoesEmLote() {
  const linhas = $$('#tabelaDescricoes tr[data-id]');
  let alterados = 0;
  for (const tr of linhas) {
    const p = DB.produtoPorId(tr.dataset.id);
    if (!p) continue;
    const texto = $('[data-campo="descricao"]', tr).value.trim();
    if (texto !== p.descricao) { await DB.salvarProduto({ ...p, descricao: texto }); alterados++; }
  }
  if (alterados) { toast(`${alterados} descrição(ões) atualizada(s) na loja!`, 'sucesso', '✅'); renderTudo(); }
  else toast('Nenhuma alteração para salvar.', '', 'ℹ️');
}

/* --------------------------------------------------------- trocar senha */
async function trocarSenha(ev) {
  ev.preventDefault();
  limparErros($('#formSenha'));
  const atual = $('#senhaAtual').value;
  const nova = $('#senhaNova').value;
  const conf = $('#senhaConfirma').value;
  let ok = true;

  if (await sha256(atual) !== hashEsperado()) { marcarErro('#senhaAtual', 'Senha atual incorreta.'); ok = false; }
  if (nova.length < 8) { marcarErro('#senhaNova', 'Use ao menos 8 caracteres.'); ok = false; }
  if (nova !== conf) { marcarErro('#senhaConfirma', 'As senhas não são iguais.'); ok = false; }
  if (!ok) { toast('Confira os campos destacados.', 'erro', '⚠️'); return; }

  const hash = await sha256(nova);
  try { localStorage.setItem(SENHA_LOCAL, hash); } catch (e) { /* ignora */ }
  $('#hashNovo').value = `senhaHash: '${hash}',`;
  $('#saidaHash').hidden = false;
  $('#formSenha').reset();
  toast('Senha alterada com sucesso!', 'sucesso', '🔒');
}

/* ===========================================================================
   INÍCIO
=========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  ADM.modais.produto  = new bootstrap.Modal($('#modalProduto'));
  ADM.modais.estilo   = new bootstrap.Modal($('#modalEstilo'));
  ADM.modais.confirma = new bootstrap.Modal($('#modalConfirma'));

  iniciarTema();
  ligarEventos();

  if (sessaoValida()) await entrarNoPainel();
  else $('#inSenha').focus();
});
