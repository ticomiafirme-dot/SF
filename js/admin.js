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
  buscaVitrine: '',
  fotoPrincipal: '',
  enqPrincipal: null,          // enquadramento escolhido no editor
  fotosExtras: [],             // [{ src, enquadramento }]
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

/** Traduz a falha de gravação para algo que o lojista entenda e possa agir. */
function mensagemDeFalha(e, acao) {
  const msg = String(e?.message || e);
  if (/permission|PERMISSION|insufficient/i.test(msg)) {
    return `Sem permissão para ${acao}. Confira as regras do Firestore em Configurações.`;
  }
  if (/quota|exceeded|resource-exhausted/i.test(msg)) {
    return `Limite do servidor atingido ao ${acao}. Tente de novo mais tarde.`;
  }
  if (/unavailable|network|offline|failed to fetch/i.test(msg)) {
    return `Sem conexão com o servidor. Nada foi ${acao === 'salvar o perfume' ? 'salvo' : 'gravado'} — verifique a internet e tente de novo.`;
  }
  if (/quota.*exceeded|QuotaExceeded/i.test(msg)) {
    return 'Espaço do navegador cheio. Use fotos menores.';
  }
  return `Não foi possível ${acao}. ${msg}`;
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

/** <img> de uma foto já com o enquadramento que o administrador escolheu.
    Sem enquadramento devolve a tag simples e o object-fit:cover do CSS vale. */
function fotoEnquadrada(src, enq, alt = '') {
  const estilo = DB.estiloEnquadramento(enq);
  return `<img src="${esc(src)}" alt="${esc(alt)}"${estilo ? ` style="${estilo}"` : ''}>`;
}

/** Miniatura quadrada do perfume nas listas do painel. */
const miniProduto = p => `<div class="mini-thumb">${
  p.imagem ? fotoEnquadrada(p.imagem, p.enquadramento) : placeholderThumb()}</div>`;

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
  const conexao = await DB.iniciar({ permitirSemear: true });

  // Primeiro acesso sem servidor: a tela de conexão vem antes do painel, para
  // o administrador não cadastrar um catálogo inteiro que ninguém verá.
  let jaAvisado = false;
  try { jaAvisado = sessionStorage.getItem('sf_pulou_conexao') === '1'; } catch (e) { /* ignora */ }

  if (!DB.conectado && !jaAvisado) {
    abrirTelaConexao();
    if (conexao.erro) {
      $('#erroConfig').textContent =
        `A configuração existe, mas a conexão falhou: ${conexao.erro.message || conexao.erro}`;
    }
    return;
  }

  $('#telaConexao').hidden = true;
  $('#painel').hidden = false;
  DB.aoMudar(() => renderTudo());
  renderTudo();
  refletirConexao();

  if (conexao.erro) {
    toast('Servidor configurado, mas a conexão falhou. Veja Configurações.', 'erro', '⚠️');
  } else {
    toast(DB.conectado ? 'Conectado ao servidor.' : 'Bem-vindo ao painel!', 'sucesso',
          DB.conectado ? '🔗' : '👋');
  }
}


/* ===========================================================================
   CONEXÃO COM O SERVIDOR
   Sem servidor, o painel grava só neste aparelho — e foi exatamente por isso
   que os produtos cadastrados não apareciam em outro celular ou navegador.
=========================================================================== */
const REGRAS_FIRESTORE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Qualquer visitante lê o catálogo da loja
    match /categorias/{doc} { allow read: if true; allow write: if true; }
    match /produtos/{doc}   { allow read: if true; allow write: if true; }

    // Usado só para testar a conexão pelo painel
    match /_teste_conexao/{doc} { allow read, write: if true; }
  }
}`;

/** Aceita o bloco copiado do console do Firebase em qualquer formato:
    o objeto inteiro, com "const firebaseConfig =" na frente, ou JSON puro. */
function lerConfigColada(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) throw new Error('Cole a configuração que o Firebase mostrou.');

  const inicio = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) throw new Error('Não encontrei a configuração. Copie o bloco inteiro, das chaves { até }.');

  const corpo = bruto.slice(inicio, fim + 1);
  let cfg;
  try {
    // eslint-disable-next-line no-new-func
    cfg = Function(`"use strict"; return (${corpo});`)();
  } catch (e) {
    throw new Error('A configuração colada está incompleta ou com erro de digitação.');
  }
  if (!cfg || typeof cfg !== 'object') throw new Error('A configuração colada não é válida.');

  const faltando = ['apiKey', 'projectId', 'appId'].filter(k => !String(cfg[k] || '').trim());
  if (faltando.length) throw new Error(`Faltou ${faltando.join(', ')} na configuração colada.`);
  return cfg;
}

/** Monta o trecho pronto para colar em js/produtos.js. */
function trechoParaOArquivo(cfg) {
  const campo = (k) => `  ${k}:${' '.repeat(Math.max(1, 18 - k.length))}'${String(cfg[k] || '')}',`;
  return 'const FIREBASE_CONFIG = {\n'
    + ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
        .map(campo).join('\n')
    + '\n};';
}

async function testarEConectar() {
  const btn = $('#btnTestarConexao');
  const erro = $('#erroConfig');
  erro.textContent = '';
  $('#colarConfig').closest('.campo').classList.remove('invalido');

  let cfg;
  try {
    cfg = lerConfigColada($('#colarConfig').value);
  } catch (e) {
    erro.textContent = e.message;
    $('#colarConfig').closest('.campo').classList.add('invalido');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Testando a conexão...';
  try {
    await DB.testarConexao(cfg);
    DB.salvarConfigLocal(cfg);
    $('#trechoConfig').value = trechoParaOArquivo(cfg);
    $('#resultadoConexao').hidden = false;
    $('#resultadoConexao').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Conectado ao servidor!', 'sucesso', '✅');
  } catch (e) {
    const msg = String(e?.message || e);
    erro.textContent = /permission|PERMISSION|insufficient/i.test(msg)
      ? 'Conectou, mas as regras do Firestore estão bloqueando. Publique as regras do passo 3 e tente de novo.'
      : `Não foi possível conectar: ${msg}`;
    $('#colarConfig').closest('.campo').classList.add('invalido');
    toast('Falha na conexão. Veja a mensagem abaixo do campo.', 'erro', '⚠️');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar e conectar';
  }
}

/** Mostra ou esconde os avisos de "não conectado" em todo o painel. */
function refletirConexao() {
  const conectado = DB.conectado;
  $('#faixaDesconectado').hidden = conectado;
  $('#desconectar').hidden = !DB.configFirebase() || DB.configNoArquivo();
  $('#statusDados').innerHTML = conectado
    ? `<span class="bolinha on"></span><b>Conectado ao servidor</b><br>O que você publica aparece em todos os aparelhos.`
    : `<span class="bolinha off"></span><b>Modo de teste</b><br>Nada daqui chega aos clientes.`;
}

function abrirTelaConexao() {
  $('#telaLogin').hidden = true;
  $('#painel').hidden = true;
  $('#faixaDesconectado').hidden = true;
  $('#telaConexao').hidden = false;
  $('#textoRegras').value = REGRAS_FIRESTORE;
  const cfg = DB.configFirebase();
  if (cfg && !$('#colarConfig').value) $('#colarConfig').value = JSON.stringify(cfg, null, 2);
  window.scrollTo({ top: 0 });
}

/* ===========================================================================
   NAVEGAÇÃO ENTRE TELAS
=========================================================================== */
const TITULOS = {
  dashboard:  ['Dashboard', 'Visão geral da sua loja.'],
  produtos:   ['Perfumes', 'Todos os perfumes cadastrados.'],
  estilos:    ['Estilos', 'As categorias que organizam a loja.'],
  vitrine:    ['Vitrine', 'Quem aparece em Destaques na página inicial.'],
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
            ${miniProduto(p)}
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
   VITRINE
   Controla a faixa "Destaques da semana" da página inicial.
=========================================================================== */
function renderVitrine() {
  const naVitrine = DB.naVitrine();
  const limite = DB.LIMITE_VITRINE;

  // Quantos realmente aparecem: publicados, com estoque e dentro do limite.
  const aparecem = naVitrine.filter(p => p.ativo && p.estoque !== false).slice(0, limite);

  const cheia = naVitrine.length >= limite;
  const resumo = $('#resumoVitrine');
  if (resumo) {
    resumo.textContent = `${naVitrine.length} de ${limite}`;
    resumo.className = 'resumo-vitrine' + (cheia ? ' cheio' : '');
  }

  // ---- lista de quem está na vitrine
  const alvo = $('#listaVitrine');
  if (naVitrine.length === 0) {
    alvo.innerHTML = `<div class="nada">
      <span class="ic">⭐</span><h3>Vitrine vazia</h3>
      <p>Sem nenhum perfume escolhido, a página inicial preenche a faixa sozinha
         com os primeiros disponíveis.</p>
    </div>`;
  } else {
    let posicaoVisivel = 0;
    alvo.innerHTML = naVitrine.map((p, i) => {
      const oculto = !p.ativo;
      const esgotado = p.estoque === false;
      // Passar do limite só acontece com dados antigos; a partir de agora é bloqueado.
      const excedente = i >= limite;
      const some = oculto || esgotado || excedente;
      if (!some) posicaoVisivel++;

      const avisos = [];
      if (oculto)   avisos.push('<span class="etiqueta oculto">Oculto — não aparece</span>');
      if (esgotado) avisos.push('<span class="etiqueta esgotado">Esgotado — não aparece</span>');
      if (excedente && !oculto && !esgotado)
        avisos.push(`<span class="etiqueta esgotado">Passou de ${limite} — tire este</span>`);

      return `<div class="item-vitrine ${some ? 'fila' : ''}" data-vit="${esc(p.id)}">
        <span class="posicao-vitrine">${some ? '—' : posicaoVisivel}</span>
        ${miniProduto(p)}
        <div class="dados">
          <div class="nm">${esc(p.nome)}</div>
          <div class="meta">${esc(DB.categoriaPorSlug(p.categoria)?.nome || '—')} · ${brl(DB.precoFinal(p))}</div>
          ${avisos.length ? `<div class="avisos">${avisos.join('')}</div>` : ''}
        </div>
        <div class="setas-vitrine">
          <button type="button" class="seta-vitrine" data-subir="${esc(p.id)}"
                  ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${esc(p.nome)}">↑</button>
          <button type="button" class="seta-vitrine" data-descer="${esc(p.id)}"
                  ${i === naVitrine.length - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer ${esc(p.nome)}">↓</button>
        </div>
        <button type="button" class="btn btn-neutro btn-sm" data-tirar-vitrine="${esc(p.id)}">Tirar</button>
      </div>`;
    }).join('');
  }

  // ---- lista de quem pode entrar
  const termo = ADM.buscaVitrine.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const fora = DB.todosProdutos()
    .filter(p => !p.destaque && p.ativo)
    .filter(p => !termo || `${p.nome} ${p.marca}`.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo));

  const alvoFora = $('#listaForaVitrine');
  const avisoCheia = $('#avisoVitrineCheia');
  if (avisoCheia) avisoCheia.hidden = !cheia;

  alvoFora.innerHTML = fora.length === 0
    ? `<p class="motivo" style="color:var(--texto-fraco);font-size:.9rem">${
        termo ? 'Nenhum perfume encontrado com esse nome.'
              : 'Todos os perfumes publicados já estão na vitrine.'}</p>`
    : fora.map(p => `<div class="item-vitrine${cheia ? ' fila' : ''}">
        ${miniProduto(p)}
        <div class="dados">
          <div class="nm">${esc(p.nome)}</div>
          <div class="meta">${esc(DB.categoriaPorSlug(p.categoria)?.nome || '—')} · ${brl(DB.precoFinal(p))}
            ${p.estoque === false ? ' · <span style="color:var(--alerta)">esgotado</span>' : ''}</div>
        </div>
        <button type="button" class="btn btn-contorno btn-sm" data-por-vitrine="${esc(p.id)}"
                ${cheia ? 'disabled title="A vitrine já está cheia"' : ''}>+ Colocar</button>
      </div>`).join('');
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
        <td><div class="cel-produto">${miniProduto(p)}
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
        <td><div class="cel-produto">${miniProduto(p)}
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
      <div class="quadro">${p.imagem ? fotoEnquadrada(p.imagem, p.enquadramento, p.nome) : placeholderThumb()}</div>
      <div class="baixo">
        <span class="nm">${esc(p.nome)}</span>
        <span class="peso">${p.imagem
          ? (p.imagem.startsWith('data:') ? `${DB.pesoImagemKB(p.imagem)} KB` : 'endereço da internet')
          : 'sem foto'}</span>
        <div class="acoes-cartao-foto">
          <button type="button" class="btn btn-contorno btn-sm" data-trocar-foto="${esc(p.id)}">
            ${p.imagem ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          ${p.imagem ? `<button type="button" class="btn btn-neutro btn-sm" data-ajustar-foto="${esc(p.id)}">
            <svg width="14" height="14" viewBox="0 0 24 24"><use href="#ic-lapis"></use></svg> Enquadrar
          </button>` : ''}
        </div>
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
  const conectado = DB.conectado;
  const noArquivo = DB.configNoArquivo();

  let html;
  if (conectado && noArquivo) {
    html = `<div class="alerta-box ok"><span class="ic">✅</span><div>
        <b>Tudo certo.</b><br>
        Os dados ficam no servidor e a configuração está no arquivo do site, então
        <b>qualquer aparelho</b> que abrir a loja vê o mesmo catálogo.
      </div></div>`;
  } else if (conectado) {
    html = `<div class="alerta-box aviso"><span class="ic">📌</span><div>
        <b>Conectado, mas só neste aparelho.</b><br>
        A configuração foi salva aqui no navegador para você testar. Para valer em
        todos os aparelhos, ela precisa ir para <code>js/produtos.js</code> e o site
        ser publicado de novo. Clique em <b>Configurar servidor</b> para pegar o código.
      </div></div>`;
  } else {
    html = `<div class="alerta-box aviso"><span class="ic">⚠️</span><div>
        <b>Nenhum servidor conectado.</b><br>
        O que você cadastrar fica <b>só neste aparelho</b> e os clientes não veem nada.
        Clique em <b>Configurar servidor</b> para resolver — leva alguns minutos e é gratuito.
      </div></div>`;
  }
  $('#infoArmazenamento').innerHTML = html;
  refletirConexao();
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
  // Sem vaga na vitrine, a caixinha fica travada com o motivo à vista.
  const semVaga = DB.vitrineCheia() && !p?.destaque;
  $('#prodDestaque').disabled = semVaga;
  const rotuloDestaque = $('#prodDestaque').closest('.marca-caixa');
  if (rotuloDestaque) rotuloDestaque.style.opacity = semVaga ? '.55' : '';
  // O motivo fica à vista, não só no tooltip — que é fácil de não perceber.
  const avisoCheio = $('#avisoDestaqueCheio');
  if (avisoCheio) avisoCheio.hidden = !semVaga;
  $('#prodImagemUrl').value = '';
  $('#erroFoto').textContent = '';

  ADM.fotoPrincipal = p?.imagem || '';
  ADM.enqPrincipal = p?.enquadramento || null;
  ADM.fotosExtras = (p?.imagensExtras || []).map(f => ({ ...f }));
  renderPreviaFoto();
  renderExtras();
  atualizarPrevia();
  ADM.modais.produto.show();
}

function renderPreviaFoto() {
  const box = $('#previaPrincipal');
  const tem = !!ADM.fotoPrincipal;
  box.classList.toggle('tem', tem);
  box.innerHTML = tem
    ? fotoEnquadrada(ADM.fotoPrincipal, ADM.enqPrincipal, 'Pré-visualização da foto')
    : 'Nenhuma foto escolhida';
  $('#rotuloBtnFoto').textContent = tem ? 'Trocar foto' : 'Escolher foto';
  $('#btnRemoverFoto').hidden = !tem;
  $('#btnAjustarFoto').hidden = !tem;
}

function renderExtras() {
  $('#tiraExtras').innerHTML = ADM.fotosExtras.map((f, i) => `
    <div class="extra-item">
      ${fotoEnquadrada(f.src, f.enquadramento, `Foto adicional ${i + 1}`)}
      <button type="button" class="ajustar-extra" data-ajustar-extra="${i}"
              title="Ajustar o enquadramento" aria-label="Ajustar o enquadramento da foto adicional ${i + 1}">
        <svg viewBox="0 0 24 24"><use href="#ic-lapis"></use></svg>
      </button>
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
    enquadramento: ADM.enqPrincipal,
    imagensExtras: ADM.fotosExtras.map(f => ({ ...f })),
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
          ? fotoEnquadrada(d.imagem, d.enquadramento)
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

  // O formulário é o outro caminho para marcar um destaque: o limite vale aqui também.
  const jaEraDestaque = d.id ? DB.produtoPorId(d.id)?.destaque : false;
  if (d.destaque && !jaEraDestaque && DB.vitrineCheia()) {
    toast(`A vitrine já tem ${DB.LIMITE_VITRINE} perfumes. Tire um na tela Vitrine antes.`, 'erro', '🔒');
    $('#prodDestaque').checked = false;
    ok = false;
  }

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
    toast(mensagemDeFalha(e, 'salvar o perfume'), 'erro', '⚠️');
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
    toast(mensagemDeFalha(e, 'salvar o estilo'), 'erro', '⚠️');
  }
}

/* ===========================================================================
   IMAGENS: escolher arquivo, enquadrar e só então usar
   ===========================================================================
   Nenhuma foto entra no produto sem passar pelo editor. É ele que faz fotos
   em pé, deitadas e quadradas caírem todas no mesmo quadro do card, sem
   deformar nenhuma e sem o site escolher o recorte no lugar do administrador.
=========================================================================== */

/** Abre o editor de enquadramento.
    @returns {Promise<{src,enquadramento}|null>} null quando cancelam. */
function enquadrar(src, enquadramento = null, opcoes = {}) {
  if (typeof EditorFoto === 'undefined' || !EditorFoto.disponivel) {
    // Sem o editor na página o cadastro continua funcionando como antes.
    return Promise.resolve({ src, enquadramento });
  }
  return EditorFoto.abrir({ src, enquadramento, ...opcoes });
}

/** Grava foto + enquadramento em um perfume já cadastrado. */
async function gravarFoto(id, foto) {
  const p = DB.produtoPorId(id);
  if (!p) return;
  try {
    await DB.salvarProduto({ ...p, imagem: foto.src, enquadramento: foto.enquadramento });
    toast('Foto atualizada — já está na loja!', 'sucesso', '🖼️');
    renderTudo();
  } catch (err) { toast(mensagemDeFalha(err, 'trocar a foto'), 'erro', '⚠️'); }
}

/** Comprime o arquivo escolhido e devolve a foto já enquadrada. */
async function prepararArquivo(arquivo, opcoes = {}) {
  const dataUrl = await DB.comprimirImagem(arquivo);
  const kb = DB.pesoImagemKB(dataUrl);
  if (kb > 800) {
    toast(`A imagem ficou grande (${kb} KB). Prefira fotos mais leves.`, 'erro', '⚠️');
  }
  return enquadrar(dataUrl, null, opcoes);
}

async function escolherImagem(input, aoPronto, opcoes = {}) {
  const arquivo = input.files?.[0];
  input.value = '';                    // libera antes do editor, que demora
  if (!arquivo) return;
  try {
    toast('Preparando a imagem...', '', '⏳');
    const pronta = await prepararArquivo(arquivo, opcoes);
    if (pronta) aoPronto(pronta);       // null = cancelou no editor
  } catch (e) {
    toast(e.message || 'Não foi possível usar esta imagem.', 'erro', '⚠️');
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
    vitrine: renderVitrine,
    precos: renderPrecos,
    imagens: renderImagens,
    descricoes: renderDescricoes,
    config: renderConfig
  }[tela] || (() => {}))();
}

function renderTudo() {
  $('#contaProdutos').textContent = DB.todosProdutos().length;
  $('#contaEstilos').textContent = DB.todasCategorias().length;
  $('#contaVitrine').textContent = DB.naVitrine().length;
  refletirConexao();
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
        try {
          const novo = await DB.duplicarProduto(dup.dataset.duplicar);
          toast('Cópia criada. Ela está oculta até você publicar.', 'sucesso', '📋');
          renderTudo();
          if (novo) abrirFormProduto(novo.id);
        } catch (err) { toast(mensagemDeFalha(err, 'duplicar o perfume'), 'erro', '⚠️'); }
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
      }).catch(err => toast(mensagemDeFalha(err, 'alterar a situação'), 'erro', '⚠️'));
      return;
    }

    const exc = ev.target.closest('[data-excluir]');
    if (exc) {
      const p = DB.produtoPorId(exc.dataset.excluir);
      confirmar({
        titulo: 'Excluir este perfume?', icone: '🗑️', rotulo: 'Sim, excluir', perigo: true,
        texto: `<b>${esc(p?.nome || '')}</b> será apagado definitivamente da loja.<br><br>Se você só quer tirá-lo do ar por um tempo, use <b>Ocultar</b> em vez de excluir.`
      }, async () => {
        try {
          await DB.excluirProduto(exc.dataset.excluir);
          toast('Perfume excluído.', 'sucesso', '🗑️');
          renderTudo();
        } catch (err) { toast(mensagemDeFalha(err, 'excluir o perfume'), 'erro', '⚠️'); }
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
        try {
          await DB.excluirCategoria(slug);
          toast('Estilo excluído.', 'sucesso', '🗑️');
          renderTudo();
        } catch (err) { toast(mensagemDeFalha(err, 'excluir o estilo'), 'erro', '⚠️'); }
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

    // ---- vitrine
    const porVit = ev.target.closest('[data-por-vitrine]');
    if (porVit) {
      const p = DB.produtoPorId(porVit.dataset.porVitrine);
      DB.alternarVitrine(porVit.dataset.porVitrine)
        .then(() => { toast(`${p?.nome} está na vitrine!`, 'sucesso', '⭐'); renderTudo(); })
        .catch(err => toast(err.message, 'erro', '⚠️'));
      return;
    }

    const tirarVit = ev.target.closest('[data-tirar-vitrine]');
    if (tirarVit) {
      const p = DB.produtoPorId(tirarVit.dataset.tirarVitrine);
      DB.alternarVitrine(tirarVit.dataset.tirarVitrine)
        .then(() => { toast(`${p?.nome} saiu da vitrine.`, 'sucesso', '✅'); renderTudo(); })
        .catch(err => toast(mensagemDeFalha(err, 'tirar da vitrine'), 'erro', '⚠️'));
      return;
    }

    const subir = ev.target.closest('[data-subir]');
    const descer = ev.target.closest('[data-descer]');
    if (subir || descer) {
      const id = (subir || descer).dataset[subir ? 'subir' : 'descer'];
      DB.moverNaVitrine(id, subir ? 'cima' : 'baixo')
        .then(() => renderTudo())
        .catch(err => toast(mensagemDeFalha(err, 'mudar a ordem'), 'erro', '⚠️'));
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
      input.onchange = () => escolherImagem(input, foto => gravarFoto(id, foto),
        { titulo: 'Enquadrar a foto nova' });
      input.click();
      return;
    }

    // ---- reenquadrar a foto que o perfume já tem, sem enviar outra
    const ajuste = ev.target.closest('[data-ajustar-foto]');
    if (ajuste) {
      const p = DB.produtoPorId(ajuste.dataset.ajustarFoto);
      if (!p?.imagem) return;
      enquadrar(p.imagem, p.enquadramento, { titulo: `Enquadrar ${p.nome}` })
        .then(foto => { if (foto) gravarFoto(p.id, foto); });
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
  $('#buscaVitrine')?.addEventListener('input', e => { ADM.buscaVitrine = e.target.value; renderVitrine(); });

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
  const aplicarFotoPrincipal = foto => {
    ADM.fotoPrincipal = foto.src;
    ADM.enqPrincipal = foto.enquadramento;
    $('#erroFoto').textContent = '';
    renderPreviaFoto(); atualizarPrevia();
  };

  $('#btnEscolherFoto').addEventListener('click', () => $('#arquivoPrincipal').click());
  $('#arquivoPrincipal').addEventListener('change', e => escolherImagem(e.target, foto => {
    aplicarFotoPrincipal(foto);
    toast('Foto enquadrada. Confira a pré-visualização ao lado.', 'sucesso', '🖼️');
  }, { titulo: 'Enquadrar a foto do perfume' }));

  // Reabre o editor com o último ajuste: nada de reenviar a mesma foto.
  $('#btnAjustarFoto').addEventListener('click', async () => {
    if (!ADM.fotoPrincipal) return;
    const foto = await enquadrar(ADM.fotoPrincipal, ADM.enqPrincipal,
      { titulo: 'Ajustar o enquadramento' });
    if (foto) { aplicarFotoPrincipal(foto); toast('Enquadramento atualizado.', 'sucesso', '✂️'); }
  });

  $('#btnRemoverFoto').addEventListener('click', () => {
    ADM.fotoPrincipal = ''; ADM.enqPrincipal = null;
    renderPreviaFoto(); atualizarPrevia();
  });
  $('#btnUsarUrl').addEventListener('click', async () => {
    const url = $('#prodImagemUrl').value.trim();
    if (!/^https?:\/\/.+/i.test(url)) { toast('Informe um endereço que comece com http.', 'erro', '⚠️'); return; }
    const foto = await enquadrar(url, null, { titulo: 'Enquadrar a foto do endereço' });
    if (!foto) return;
    aplicarFotoPrincipal(foto);
    toast('Endereço aplicado à foto principal.', 'sucesso', '🔗');
  });

  $('#btnAddExtra').addEventListener('click', () => $('#arquivoExtra').click());
  $('#arquivoExtra').addEventListener('change', async e => {
    const arquivos = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = '';
    // Uma de cada vez: cada foto abre o editor e espera o enquadramento.
    for (let i = 0; i < arquivos.length; i++) {
      try {
        const foto = await prepararArquivo(arquivos[i], {
          titulo: `Enquadrar a foto adicional ${i + 1} de ${arquivos.length}`
        });
        if (foto) { ADM.fotosExtras.push(foto); renderExtras(); }
      } catch (err) { toast(err.message, 'erro', '⚠️'); }
    }
    renderExtras();
  });
  $('#tiraExtras').addEventListener('click', async ev => {
    const ajustar = ev.target.closest('[data-ajustar-extra]');
    if (ajustar) {
      const i = Number(ajustar.dataset.ajustarExtra);
      const atual = ADM.fotosExtras[i];
      if (!atual) return;
      const foto = await enquadrar(atual.src, atual.enquadramento,
        { titulo: `Ajustar a foto adicional ${i + 1}` });
      if (foto) { ADM.fotosExtras[i] = foto; renderExtras(); }
      return;
    }
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

  // ---- conexão com o servidor
  $('#btnTestarConexao').addEventListener('click', testarEConectar);
  $('#verRegras').addEventListener('click', () => {
    const c = $('#caixaRegras');
    c.hidden = !c.hidden;
    $('#verRegras').textContent = c.hidden ? 'Ver as regras do passo 3' : 'Esconder as regras';
  });
  const copiar = async (sel, msg) => {
    try { await navigator.clipboard.writeText($(sel).value); toast(msg, 'sucesso', '📋'); }
    catch (e) { $(sel).select(); toast('Selecione o texto e copie com Ctrl+C.', '', '📋'); }
  };
  $('#copiarRegras').addEventListener('click', () => copiar('#textoRegras', 'Regras copiadas.'));
  $('#copiarTrecho').addEventListener('click', () => copiar('#trechoConfig', 'Código copiado. Cole em js/produtos.js.'));

  $('#entrarAposConectar').addEventListener('click', () => location.reload());
  $('#pularConexao').addEventListener('click', () => {
    try { sessionStorage.setItem('sf_pulou_conexao', '1'); } catch (e) { /* ignora */ }
    $('#telaConexao').hidden = true;
    entrarNoPainel();
  });
  $('#abrirConexao').addEventListener('click', abrirTelaConexao);
  $('#desconectar').addEventListener('click', () => confirmar({
    titulo: 'Desconectar deste aparelho?', icone: '🔌', rotulo: 'Desconectar', perigo: true,
    texto: 'O painel volta ao modo de teste neste navegador. Os dados que já estão no servidor não são apagados.'
  }, () => { DB.limparConfigLocal(); location.reload(); }));

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
        toast(/JSON|formato/i.test(String(err?.message))
          ? 'Arquivo inválido. Escolha uma cópia baixada por este painel.'
          : mensagemDeFalha(err, 'restaurar o catálogo'), 'erro', '⚠️');
      }
    });
  });

  $('#btnResetar').addEventListener('click', () => confirmar({
    titulo: 'Apagar tudo e recomeçar?', icone: '🗑️', rotulo: 'Sim, apagar tudo', perigo: true,
    texto: 'Todos os perfumes e estilos que você cadastrou serão apagados e o catálogo de exemplo volta.<br><br><b>Não há como desfazer.</b> Baixe uma cópia de segurança antes, se quiser.'
  }, async () => {
    try {
      await DB.restaurarPadrao();
      toast('Catálogo restaurado ao exemplo inicial.', 'sucesso', '↩️');
      renderTudo();
    } catch (e) { toast(mensagemDeFalha(e, 'restaurar o catálogo'), 'erro', '⚠️'); }
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
      try {
        await DB.salvarProduto({ ...p, preco: normal, precoPromocional: promo });
        alterados++;
      } catch (e) {
        toast(mensagemDeFalha(e, 'salvar os preços'), 'erro', '⚠️');
        renderTudo();
        return;
      }
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
    if (texto !== p.descricao) {
      try {
        await DB.salvarProduto({ ...p, descricao: texto });
        alterados++;
      } catch (e) {
        toast(mensagemDeFalha(e, 'salvar as descrições'), 'erro', '⚠️');
        renderTudo();
        return;
      }
    }
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
