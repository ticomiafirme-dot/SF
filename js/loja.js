/* =============================================================================
   SF PARFUMS — loja.js
   Tema claro/escuro, renderização do catálogo, busca, filtros e modal de produto.
============================================================================= */
'use strict';

const SF = {
  filtro: 'todos',
  termo: '',
  ordem: 'padrao',
  produtoAberto: null,
  modais: {}
};

/* ----------------------------------------------------------- UTILITÁRIOS */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** Formata número como moeda brasileira. */
function brl(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Escapa texto vindo do arquivo de catálogo antes de injetar no HTML. */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Normaliza para busca: minúsculo e sem acentos. */
function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function categoriaPorSlug(slug) {
  return DB.categoriaPorSlug(slug);
}

function nomeCategoria(slug) {
  const cat = categoriaPorSlug(slug);
  return cat ? cat.nome : slug;
}

function produtoPorId(id) {
  return DB.produtoPorId(id);
}

/* Atalhos para o catálogo visível ao cliente (só itens ativos). */
const listaCategorias = () => DB.categorias();
const listaProdutos   = () => DB.produtos();

/** Foto grande do detalhe: a imagem inteira, com uma cópia desfocada ao fundo
    preenchendo as sobras quando a proporção da foto não bate com a do quadro. */
function fotoDetalhe(src, alt) {
  if (!src) return placeholderMarca();
  return `<img class="fundo-borrado" src="${esc(src)}" alt="" aria-hidden="true">
          <img src="${esc(src)}" alt="${esc(alt)}">`;
}

/** Imagem do produto ou placeholder com o monograma da marca.
    Quando o administrador ajustou o enquadramento no painel, o estilo em linha
    reproduz exatamente aquele recorte — sem ele vale o object-fit:cover do CSS. */
function midiaProduto(produto, classe = '') {
  if (produto.imagem) {
    const enq = DB.estiloEnquadramento(produto.enquadramento);
    // Se a URL da foto falhar, o card cai no monograma da marca sem quebrar o layout.
    return `<img src="${esc(produto.imagem)}" alt="${esc(produto.nome)}" class="${classe}" loading="lazy"
             ${enq ? `style="${enq}"` : ''} onerror="SF.trocarPorPlaceholder(this)">`;
  }
  return placeholderMarca();
}

/** Substitui uma <img> quebrada pelo placeholder da marca. */
SF.trocarPorPlaceholder = function (img) {
  const molde = document.createElement('div');
  molde.innerHTML = placeholderMarca();
  img.replaceWith(molde.firstElementChild);
};

function placeholderMarca() {
  return `<span class="placeholder-marca"><svg viewBox="0 0 120 70" aria-hidden="true"><use href="#monograma"></use></svg><span>SF Parfums</span></span>`;
}

/** Notificação flutuante. tipo: 'sucesso' | 'erro' | '' */
function toast(mensagem, tipo = '', icone = '') {
  const caixa = $('#toasts');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = `toast-sf ${tipo}`.trim();
  el.setAttribute('role', 'status');
  el.innerHTML = `${icone ? `<span class="ic">${icone}</span>` : ''}<span>${esc(mensagem)}</span>`;
  caixa.appendChild(el);
  setTimeout(() => {
    el.classList.add('saindo');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2600);
}

/* ------------------------------------------------------------------ TEMA */
const CHAVE_TEMA = 'sf_parfums_tema';

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  const uso = $('#iconeTema')?.querySelector('use');
  if (uso) uso.setAttribute('href', tema === 'escuro' ? '#ic-sol' : '#ic-lua');
  $('#btnTema')?.setAttribute('title', tema === 'escuro' ? 'Ativar modo claro' : 'Ativar modo escuro');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'escuro' ? '#0b0b0c' : '#ffffff');
}

function iniciarTema() {
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE_TEMA); } catch (e) { /* storage indisponível */ }
  const prefereEscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  aplicarTema(salvo || (prefereEscuro ? 'escuro' : 'claro'));

  $('#btnTema')?.addEventListener('click', () => {
    const novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    aplicarTema(novo);
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch (e) { /* ignora */ }
    toast(novo === 'escuro' ? 'Modo escuro ativado' : 'Modo claro ativado', '', novo === 'escuro' ? '🌙' : '☀️');
  });
}

/* --------------------------------------------------------- CARD DE PRODUTO */
function cardProduto(p) {
  const riscado = DB.precoRiscado(p);
  const semEstoque = p.estoque === false;
  return `
  <div class="col">
    <article class="card-prod" data-id="${esc(p.id)}">
      <div class="moldura" data-abrir="${esc(p.id)}" role="button" tabindex="0" aria-label="Ver detalhes de ${esc(p.nome)}">
        ${riscado ? '<span class="selo oferta">Oferta</span>' : ''}
        ${semEstoque ? '<span class="selo esgotado">Esgotado</span>' : ''}
        ${midiaProduto(p)}
        <span class="olhada">Ver detalhes</span>
      </div>
      <div class="info">
        <span class="cat">${esc(nomeCategoria(p.categoria))}</span>
        <h3>${esc(p.nome)}</h3>
        ${p.volume ? `<span class="vol">${esc(p.volume)}</span>` : ''}
        <div class="precos">
          <span class="preco">${brl(DB.precoFinal(p))}</span>
          ${riscado ? `<span class="preco-antigo">${brl(riscado)}</span>` : ''}
        </div>
        <div class="acoes-card">
          <button type="button" class="btn btn-contorno" data-abrir="${esc(p.id)}">Detalhes</button>
          <button type="button" class="btn-add-rapido" data-add="${esc(p.id)}"
                  ${semEstoque ? 'disabled' : ''} aria-label="Adicionar ${esc(p.nome)} ao carrinho"
                  title="${semEstoque ? 'Produto esgotado' : 'Adicionar ao carrinho'}">
            <svg aria-hidden="true"><use href="#ic-mais"></use></svg>
          </button>
        </div>
      </div>
    </article>
  </div>`;
}

/* -------------------------------------- NAVEGAÇÃO MONTADA PELAS CATEGORIAS */
/* O menu do topo é fixo (Início e Catálogo). Menu do celular e lista do rodapé
   saem daqui, então um estilo novo cadastrado no painel aparece na navegação
   sem tocar no HTML. */
function renderNavegacao() {
  const cats = listaCategorias();

  const menuCelular = $('#menuCategorias');
  if (menuCelular) {
    menuCelular.innerHTML = cats.map(c =>
      `<a href="#catalogo" class="link-nav link-cat" data-cat="${esc(c.slug)}" data-bs-dismiss="offcanvas">
         <span>${esc(c.nome)}</span><span class="emoji">${esc(c.icone)}</span>
       </a>`).join('')
      + `<a href="#catalogo" class="link-nav link-cat" data-cat="todos" data-bs-dismiss="offcanvas">
           <span>Todos os produtos</span><span class="emoji">✨</span>
         </a>`;
  }

  const rodape = $('#rodapeCategorias');
  if (rodape) {
    rodape.innerHTML = cats.map(c =>
      `<li><a href="#catalogo" class="link-cat" data-cat="${esc(c.slug)}">${esc(c.nome)}</a></li>`).join('')
      + '<li><a href="#catalogo" class="link-cat" data-cat="todos">Todos os produtos</a></li>';
  }
}

/* ------------------------------------------------------- RENDER CATEGORIAS */
function renderCategorias() {
  const alvo = $('#gradeCategorias');
  if (!alvo) return;
  const cats = listaCategorias();

  // O título acompanha a quantidade de estilos cadastrados no painel.
  const NUMEROS = ['Nenhuma', 'Uma', 'Duas', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];
  const titulo = $('#tituloCategorias');
  if (titulo) {
    titulo.textContent = cats.length >= 2 && cats.length <= 10
      ? `${NUMEROS[cats.length]} coleções, um só padrão`
      : 'Nossas coleções';
  }

  alvo.innerHTML = cats.map(cat => {
    const qtd = DB.contarProdutos(cat.slug);
    return `
    <div class="col">
      <article class="card-cat">
        ${cat.imagem ? `<img class="capa-cat" src="${esc(cat.imagem)}" alt="${esc(cat.nome)}" loading="lazy">` : ''}
        <span class="emoji">${esc(cat.icone)}</span>
        ${cat.chamada ? `<span class="chamada">${esc(cat.chamada)}</span>` : ''}
        <h3>${esc(cat.nome)}</h3>
        <p>${esc(cat.descricao)}</p>
        <span class="qtd">${qtd} ${qtd === 1 ? 'produto disponível' : 'produtos disponíveis'}</span>
        <button type="button" class="btn btn-ouro btn-sm link-cat" data-cat="${cat.slug}">Explorar categoria</button>
      </article>
    </div>`;
  }).join('');
}

/* -------------------------------------------------------- RENDER DESTAQUES */
function renderDestaques() {
  const alvo = $('#gradeDestaques');
  if (!alvo) return;
  const visiveis = listaProdutos();
  // A ordem é a definida na tela Vitrine do painel, não a de edição.
  const porVitrine = (a, b) =>
    (a.ordemVitrine - b.ordemVitrine) || a.nome.localeCompare(b.nome, 'pt-BR');
  let destaques = visiveis.filter(p => p.destaque && p.estoque !== false).sort(porVitrine);
  if (destaques.length === 0) destaques = visiveis.filter(p => p.estoque !== false).slice(0, 8);
  alvo.innerHTML = destaques.slice(0, 8).map(cardProduto).join('');
  const secao = $('#destaques');
  if (secao) secao.hidden = destaques.length === 0;
}

/* ----------------------------------------------------------- CHIPS FILTRO */
function renderChips() {
  const alvo = $('#chipsCategorias');
  if (!alvo) return;
  const itens = [{ slug: 'todos', nome: 'Todos' }, ...listaCategorias()];
  alvo.innerHTML = itens.map(c => {
    const qtd = DB.contarProdutos(c.slug);
    return `<button type="button" class="chip${c.slug === SF.filtro ? ' ativo' : ''}"
              data-chip="${c.slug}" aria-pressed="${c.slug === SF.filtro}">${esc(c.nome)} (${qtd})</button>`;
  }).join('');
}

/* --------------------------------------------- FILTRAR / ORDENAR / RENDER */
function produtosVisiveis() {
  const termo = normalizar(SF.termo).trim();
  let lista = listaProdutos().filter(p => {
    const passaCategoria = SF.filtro === 'todos' || p.categoria === SF.filtro;
    if (!passaCategoria) return false;
    if (!termo) return true;
    // A busca procura pelo nome do produto (e ajuda com categoria/volume).
    const alvo = normalizar(`${p.nome} ${nomeCategoria(p.categoria)} ${p.volume || ''}`);
    return termo.split(/\s+/).every(parte => alvo.includes(parte));
  });

  const ordens = {
    menor: (a, b) => DB.precoFinal(a) - DB.precoFinal(b),
    maior: (a, b) => DB.precoFinal(b) - DB.precoFinal(a),
    az:    (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    za:    (a, b) => b.nome.localeCompare(a.nome, 'pt-BR')
  };
  if (ordens[SF.ordem]) lista = [...lista].sort(ordens[SF.ordem]);
  return lista;
}

function renderCatalogo() {
  const alvo = $('#gradeProdutos');
  if (!alvo) return;
  const lista = produtosVisiveis();

  // Título e subtítulo acompanham o filtro ativo
  const cat = categoriaPorSlug(SF.filtro);
  $('#tituloCatalogo').textContent = cat ? cat.nome : 'Todos os produtos';
  $('#subtituloCatalogo').textContent = cat
    ? cat.descricao
    : 'Use a busca e os filtros para achar seu perfume em segundos.';

  // Contador de resultados
  const contador = $('#contadorResultados');
  if (SF.termo.trim()) {
    contador.innerHTML = lista.length
      ? `<b>${lista.length}</b> ${lista.length === 1 ? 'resultado' : 'resultados'} para “${esc(SF.termo.trim())}”`
      : `Nenhum resultado para “${esc(SF.termo.trim())}”`;
  } else {
    contador.innerHTML = `Exibindo <b>${lista.length}</b> ${lista.length === 1 ? 'produto' : 'produtos'}`;
  }

  if (lista.length === 0) {
    alvo.innerHTML = `
      <div class="vazio">
        <span class="icone">🔎</span>
        <h3>Nenhum perfume encontrado</h3>
        <p>Tente outro termo de busca ou veja o catálogo completo.</p>
        <button type="button" class="btn btn-ouro" id="btnLimparFiltros">Ver todos os produtos</button>
      </div>`;
    $('#btnLimparFiltros')?.addEventListener('click', () => {
      SF.termo = '';
      SF.filtro = 'todos';
      sincronizarCamposBusca('');
      renderChips();
      renderCatalogo();
    });
    return;
  }

  alvo.innerHTML = lista.map(cardProduto).join('');
}

function sincronizarCamposBusca(valor) {
  ['#buscaHeader', '#buscaDrawer', '#buscaCatalogo'].forEach(sel => {
    const el = $(sel);
    if (el && el.value !== valor) el.value = valor;
  });
  const limpar = $('#limparBusca');
  if (limpar) limpar.hidden = !valor;
}

/** Aplica um termo de busca vindo de qualquer um dos três campos. */
function aplicarBusca(valor, rolar = false) {
  SF.termo = valor;
  sincronizarCamposBusca(valor);
  renderCatalogo();
  if (rolar && valor.trim()) irParaCatalogo();
}

function irParaCatalogo() {
  $('#catalogo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Seleciona uma categoria (ou 'todos') e leva o cliente ao catálogo. */
function selecionarCategoria(slug, rolar = true) {
  SF.filtro = slug;
  renderChips();
  renderCatalogo();
  // "Catálogo" fica marcado em qualquer estilo escolhido, não só em "Todos".
  $('.nav-desktop .link-cat')?.classList.add('ativo');
  $('.nav-desktop .link-secao')?.classList.remove('ativo');
  if (rolar) irParaCatalogo();
}

/* --------------------------------------------------------- MODAL PRODUTO */
function abrirProduto(id) {
  const p = produtoPorId(id);
  if (!p) return;
  SF.produtoAberto = { id: p.id, qtd: 1 };

  const riscado = DB.precoRiscado(p);
  const valor = DB.precoFinal(p);
  const semEstoque = p.estoque === false;
  const desconto = riscado ? Math.round((1 - valor / riscado) * 100) : 0;
  const galeria = [{ src: p.imagem, enquadramento: p.enquadramento },
                   ...(p.imagensExtras || [])].filter(f => f && f.src);

  $('#modalProdutoCorpo').innerHTML = `
    <div class="detalhe">
      <div class="detalhe-lado">
        <div class="detalhe-img" id="detalheFoto" role="button" tabindex="0"
             aria-label="Ampliar foto de ${esc(p.nome)}">${fotoDetalhe(p.imagem, p.nome)}</div>
        ${galeria.length > 1 ? `<div class="miniaturas">${galeria.map((f, i) =>
          `<button type="button" class="mini-foto${i === 0 ? ' ativa' : ''}" data-foto="${esc(f.src)}" aria-label="Foto ${i + 1}">
             <img src="${esc(f.src)}" alt="" loading="lazy" style="${DB.estiloEnquadramento(f.enquadramento)}">
           </button>`).join('')}</div>` : ''}
      </div>
      <div class="detalhe-info">
        <span class="cat">${esc(nomeCategoria(p.categoria))}</span>
        <h2>${esc(p.nome)}</h2>
        ${p.marca ? `<span class="vol">Marca: ${esc(p.marca)}</span>` : ''}
        <div class="detalhe-precos">
          <span class="preco">${brl(valor)}</span>
          ${riscado ? `<span class="preco-antigo">${brl(riscado)}</span>
                        <span class="economia">−${desconto}%</span>` : ''}
        </div>
        ${p.descricao ? `<p class="desc">${esc(p.descricao)}</p>` : ''}
        ${(p.volume || p.genero || p.notas) ? `<ul class="fichas">
          ${p.volume ? `<li><span>Volume</span><b>${esc(p.volume)}</b></li>` : ''}
          ${p.genero ? `<li><span>Gênero</span><b>${esc(p.genero)}</b></li>` : ''}
          ${p.notas  ? `<li><span>Notas</span><b>${esc(p.notas)}</b></li>` : ''}
        </ul>` : ''}
        <div class="detalhe-sep"></div>

        ${semEstoque ? `
          <div class="alerta-box aviso" style="margin:0">
            <span class="ic">⚠️</span>
            <div>Produto <b>esgotado</b> no momento. Fale com um vendedor para saber da próxima reposição.</div>
          </div>` : `
          <div class="qtd-linha">
            <span class="rot">Quantidade</span>
            <div class="stepper">
              <button type="button" id="modalMenos" aria-label="Diminuir quantidade">−</button>
              <input type="number" id="modalQtd" value="1" min="1" max="99" aria-label="Quantidade">
              <button type="button" id="modalMais" aria-label="Aumentar quantidade">+</button>
            </div>
            <span class="detalhe-total">Total: <b id="modalTotal">${brl(valor)}</b></span>
          </div>`}

        <div class="detalhe-acoes">
          ${semEstoque ? `
            <button type="button" class="btn btn-neutro btn-bloco" disabled>Produto esgotado</button>` : `
            <button type="button" class="btn btn-ouro btn-bloco" id="modalAdicionar">
              <svg width="16" height="16" aria-hidden="true"><use href="#ic-carrinho"></use></svg>
              Adicionar ao carrinho
            </button>
            <button type="button" class="btn btn-contorno btn-bloco" id="modalComprar">Comprar agora</button>`}
        </div>

        <div class="detalhe-nota"><span>🚚</span><div>Entrega <b>grátis</b> em Santa Fé do Sul, Três Fronteiras, Rubinéia, Santa Rita e Santa Clara. Demais cidades: frete a combinar.</div></div>
        <div class="detalhe-nota"><span>💬</span><div>O pedido é finalizado pelo WhatsApp com o vendedor que você escolher.</div></div>
      </div>
    </div>`;

  if (!semEstoque) {
    const campo = $('#modalQtd');
    const atualizar = () => {
      let q = Math.min(99, Math.max(1, parseInt(campo.value, 10) || 1));
      campo.value = q;
      SF.produtoAberto.qtd = q;
      $('#modalTotal').textContent = brl(valor * q);
      $('#modalMenos').disabled = q <= 1;
    };
    $('#modalMenos').addEventListener('click', () => { campo.value = (parseInt(campo.value, 10) || 1) - 1; atualizar(); });
    $('#modalMais').addEventListener('click',  () => { campo.value = (parseInt(campo.value, 10) || 1) + 1; atualizar(); });
    campo.addEventListener('input', atualizar);
    atualizar();

    $('#modalAdicionar').addEventListener('click', () => {
      Carrinho.adicionar(p.id, SF.produtoAberto.qtd);
      SF.modais.produto.hide();
    });
    $('#modalComprar').addEventListener('click', () => {
      Carrinho.adicionar(p.id, SF.produtoAberto.qtd, true);
      SF.modais.produto.hide();
      setTimeout(() => Checkout.abrir(), 320);
    });
  }

  // Galeria e ampliação valem para qualquer produto, inclusive esgotado —
  // antes ficavam presas ao bloco de quem tinha estoque e não respondiam.
  let fotoAtual = p.imagem;

  $$('.mini-foto').forEach(btn => btn.addEventListener('click', () => {
    $$('.mini-foto').forEach(b => b.classList.remove('ativa'));
    btn.classList.add('ativa');
    fotoAtual = btn.dataset.foto;
    $('#detalheFoto').innerHTML = fotoDetalhe(fotoAtual, p.nome);
  }));

  const ampliar = () => { if (fotoAtual) abrirLupa(fotoAtual, p.nome); };
  $('#detalheFoto').addEventListener('click', ampliar);
  $('#detalheFoto').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ampliar(); }
  });

  SF.modais.produto.show();
}

/* ------------------------------------------------------------------- LUPA */
/* Foto em tela cheia: no celular o quadro do modal é pequeno demais para
   avaliar um frasco, que é o que decide a compra. */
function abrirLupa(src, alt) {
  const lupa = $('#lupaFoto');
  if (!lupa) return;
  $('#lupaImagem').src = src;
  $('#lupaImagem').alt = alt || '';
  lupa.hidden = false;
  document.body.classList.add('trava-scroll');
  $('#lupaFechar').focus();
}

function fecharLupa() {
  const lupa = $('#lupaFoto');
  if (!lupa || lupa.hidden) return;
  lupa.hidden = true;
  $('#lupaImagem').src = '';
  document.body.classList.remove('trava-scroll');
}

/* ------------------------------------------------- CONTEÚDO DINÂMICO GERAL */
function preencherDadosDaLoja() {
  // Instagram — cabeçalho, menu, rodapé e lista de contatos
  ['#linkInstagramHeader', '#linkInstagramMenu', '#linkInstagramRodape', '#linkInstagramLista']
    .forEach(sel => { const el = $(sel); if (el) el.href = LOJA.instagram; });
  const handle = $('#instaHandle');
  if (handle) handle.textContent = LOJA.instagramHandle;

  // WhatsApp de contato rápido (primeiro vendedor da lista)
  const zapPadrao = `https://wa.me/${LOJA.vendedores[0].telefone}?text=${encodeURIComponent('Olá! Vim pelo site da SF PARFUMS e gostaria de mais informações.')}`;
  ['#fabZap', '#linkZapRodape'].forEach(sel => { const el = $(sel); if (el) el.href = zapPadrao; });

  // Cidades com frete grátis no rodapé
  const listaCidades = $('#listaCidadesRodape');
  if (listaCidades) {
    listaCidades.innerHTML = LOJA.cidadesFreteGratis.map(c => `<li><span>✓ ${esc(c)}</span></li>`).join('')
      + '<li><span style="color:var(--texto-fraco)">Outras cidades: a combinar</span></li>';
  }

  // Vendedores no rodapé
  const listaVend = $('#listaVendedoresRodape');
  if (listaVend) {
    listaVend.innerHTML = LOJA.vendedores.map(v => `
      <li class="vendedor-linha">
        <a href="https://wa.me/${v.telefone}" target="_blank" rel="noopener">
          <b>${esc(v.nome)}</b> — ${esc(v.exibicao)}
        </a>
      </li>`).join('');
  }

  // Subtítulo do hero cita os estilos realmente cadastrados
  const heroSub = $('#heroSub');
  if (heroSub) {
    const nomes = listaCategorias().map(c => c.nome);
    const lista = nomes.length > 4
      ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3} linhas`
      : nomes.length > 1
        ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
        : nomes[0] || '';
    heroSub.textContent = lista
      ? `${lista} reunidos em um só lugar. Escolha, monte seu pedido e finalize em segundos pelo WhatsApp.`
      : 'Escolha, monte seu pedido e finalize em segundos pelo WhatsApp.';
  }

  // Estatística do hero e ano do rodapé
  const stat = $('#statTotal');
  if (stat) stat.textContent = DB.contarProdutos('todos');
  const statCats = $('#statCategorias');
  if (statCats) statCats.textContent = listaCategorias().length;
  const ano = $('#ano');
  if (ano) ano.textContent = new Date().getFullYear();

  // Aviso de catálogo em demonstração: some assim que existir produto real.
  const soExemplos = listaProdutos().length > 0
    && listaProdutos().every(p => /^\[EXEMPLO\]/.test(p.nome));
  const faixa = $('#faixaDemo');
  if (faixa) faixa.hidden = !soExemplos;
}

/* ----------------------------------------------------------------- EVENTOS */
function ligarEventos() {
  // Cliques delegados: abrir produto, adicionar rápido, filtrar categoria
  document.addEventListener('click', ev => {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { abrirProduto(abrir.dataset.abrir); return; }

    const add = ev.target.closest('[data-add]');
    if (add) { Carrinho.adicionar(add.dataset.add, 1); return; }

    const chip = ev.target.closest('[data-chip]');
    if (chip) { selecionarCategoria(chip.dataset.chip, false); return; }

    const linkCat = ev.target.closest('.link-cat');
    if (linkCat) {
      ev.preventDefault();
      selecionarCategoria(linkCat.dataset.cat);
      bootstrap.Offcanvas.getInstance($('#menuDrawer'))?.hide();
      return;
    }
  });

  // Lupa: fecha no X, clicando fora da foto ou com Esc
  $('#lupaFechar')?.addEventListener('click', fecharLupa);
  $('#lupaFoto')?.addEventListener('click', ev => {
    if (ev.target.id !== 'lupaImagem') fecharLupa();
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') fecharLupa();
  });

  // Enter/Espaço abre o produto pela moldura (acessibilidade de teclado)
  document.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.moldura[data-abrir]')) {
      ev.preventDefault();
      abrirProduto(ev.target.dataset.abrir);
    }
  });

  // Busca — os três campos ficam sincronizados
  $('#buscaCatalogo')?.addEventListener('input', e => aplicarBusca(e.target.value));
  $('#buscaHeader')?.addEventListener('input',   e => aplicarBusca(e.target.value));
  $('#buscaDrawer')?.addEventListener('input',   e => aplicarBusca(e.target.value));
  $('#buscaHeader')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); irParaCatalogo(); } });
  $('#buscaDrawer')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      bootstrap.Offcanvas.getInstance($('#menuDrawer'))?.hide();
      setTimeout(irParaCatalogo, 260);
    }
  });
  $('#limparBusca')?.addEventListener('click', () => aplicarBusca(''));

  // Ordenação
  $('#ordenar')?.addEventListener('change', e => { SF.ordem = e.target.value; renderCatalogo(); });

  // Header com sombra + botão "voltar ao topo"
  const header = $('#header');
  const btnTopo = $('#btnTopo');
  const aoRolar = () => {
    header?.classList.toggle('rolou', window.scrollY > 12);
    btnTopo?.classList.toggle('visivel', window.scrollY > 640);
  };
  window.addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();
  btnTopo?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // Link "Início" volta ao estado inicial da navegação
  $$('.link-secao').forEach(a => a.addEventListener('click', () => {
    $$('.nav-desktop a').forEach(x => x.classList.remove('ativo'));
    $('.nav-desktop .link-secao')?.classList.add('ativo');
  }));
}

/* --------------------------------------------------------------- REDESENHO */
/* Chamado no início e a cada mudança vinda do painel. */
function redesenhar() {
  // Se o estilo filtrado foi desativado ou removido, volta para "Todos".
  if (SF.filtro !== 'todos' && !categoriaPorSlug(SF.filtro)) SF.filtro = 'todos';
  preencherDadosDaLoja();
  renderNavegacao();
  renderCategorias();
  renderDestaques();
  renderChips();
  renderCatalogo();
}

/* ------------------------------------------------------------------- INÍCIO */
document.addEventListener('DOMContentLoaded', async () => {
  SF.modais.produto  = new bootstrap.Modal($('#modalProduto'));
  SF.modais.checkout = new bootstrap.Modal($('#modalCheckout'));
  SF.modais.vendedor = new bootstrap.Modal($('#modalVendedor'));
  SF.drawerCarrinho  = new bootstrap.Offcanvas($('#carrinhoDrawer'));

  iniciarTema();
  ligarEventos();

  // Catálogo vem da camada de dados. A loja nunca grava no banco:
  // semear é tarefa exclusiva do painel administrativo.
  try {
    await DB.iniciar({ permitirSemear: false });
  } catch (e) {
    console.error('[SF] Falha ao carregar o catálogo:', e);
  }
  redesenhar();

  // Publicou algo no painel? A loja se atualiza sozinha, sem recarregar.
  DB.aoMudar(() => {
    redesenhar();
    Carrinho.render();
  });

  Carrinho.iniciar();
  Checkout.iniciar();
  document.body.classList.add('carregado');
});
