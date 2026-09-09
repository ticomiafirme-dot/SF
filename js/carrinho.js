/* =============================================================================
   SF PARFUMS — carrinho.js
   Carrinho de compras com persistência em localStorage.
============================================================================= */
'use strict';

const Carrinho = (() => {
  const CHAVE = 'sf_parfums_carrinho';
  let itens = []; // [{ id, qtd }]

  /* ------------------------------------------------------- PERSISTÊNCIA */
  function carregar() {
    try {
      const bruto = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      // Mantém apenas itens que ainda existem no catálogo (produtos podem sair de linha).
      itens = Array.isArray(bruto)
        ? bruto
            .filter(i => i && typeof i.id === 'string' && produtoPorId(i.id))
            .map(i => ({ id: i.id, qtd: Math.min(99, Math.max(1, parseInt(i.qtd, 10) || 1)) }))
        : [];
    } catch (e) {
      itens = [];
    }
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch (e) { /* storage cheio/bloqueado */ }
  }

  /* ------------------------------------------------------------ CONSULTAS */
  const totalItens = () => itens.reduce((s, i) => s + i.qtd, 0);

  const totalValor = () => itens.reduce((s, i) => {
    const p = produtoPorId(i.id);
    return p ? s + p.preco * i.qtd : s;
  }, 0);

  /** Itens do carrinho já combinados com os dados do produto. */
  const detalhado = () => itens
    .map(i => {
      const p = produtoPorId(i.id);
      return p ? { ...p, qtd: i.qtd, subtotal: p.preco * i.qtd } : null;
    })
    .filter(Boolean);

  const vazio = () => itens.length === 0;

  /* ---------------------------------------------------------- OPERAÇÕES */
  function adicionar(id, qtd = 1, silencioso = false) {
    const p = produtoPorId(id);
    if (!p) return;
    if (p.estoque === false) {
      toast('Este produto está esgotado.', 'erro', '⚠️');
      return;
    }
    const existente = itens.find(i => i.id === id);
    if (existente) {
      existente.qtd = Math.min(99, existente.qtd + qtd);
    } else {
      itens.push({ id, qtd: Math.min(99, Math.max(1, qtd)) });
    }
    salvar();
    render();
    pulsarBadge();
    if (!silencioso) toast(`${p.nome} adicionado ao carrinho`, 'sucesso', '🛍️');
  }

  function definirQtd(id, qtd) {
    const item = itens.find(i => i.id === id);
    if (!item) return;
    const nova = Math.min(99, Math.max(0, parseInt(qtd, 10) || 0));
    if (nova === 0) { remover(id); return; }
    item.qtd = nova;
    salvar();
    render();
  }

  function remover(id) {
    const p = produtoPorId(id);
    itens = itens.filter(i => i.id !== id);
    salvar();
    render();
    if (p) toast(`${p.nome} removido do carrinho`, '', '🗑️');
  }

  function limpar() {
    itens = [];
    salvar();
    render();
  }

  /* -------------------------------------------------------------- VISUAL */
  function pulsarBadge() {
    const badge = document.querySelector('#badgeCarrinho');
    if (!badge) return;
    badge.classList.remove('pulsa');
    void badge.offsetWidth; // reinicia a animação
    badge.classList.add('pulsa');
  }

  function itemHTML(p) {
    return `
    <div class="item-carrinho" data-item="${esc(p.id)}">
      <div class="mini">${midiaProduto(p)}</div>
      <div class="dados">
        <span class="cat">${esc(nomeCategoria(p.categoria))}</span>
        <h4>${esc(p.nome)}</h4>
        <span class="unit">${brl(p.preco)} ${p.volume ? `· ${esc(p.volume)}` : ''} a unidade</span>
        <div class="stepper">
          <button type="button" data-menos="${esc(p.id)}" aria-label="Diminuir quantidade de ${esc(p.nome)}">−</button>
          <input type="number" value="${p.qtd}" min="1" max="99" data-qtd="${esc(p.id)}" aria-label="Quantidade de ${esc(p.nome)}">
          <button type="button" data-mais="${esc(p.id)}" aria-label="Aumentar quantidade de ${esc(p.nome)}">+</button>
        </div>
      </div>
      <div class="lado">
        <button type="button" class="btn-remover" data-remover="${esc(p.id)}" aria-label="Remover ${esc(p.nome)}">
          <svg aria-hidden="true"><use href="#ic-lixo"></use></svg>
        </button>
        <span class="sub">${brl(p.subtotal)}</span>
      </div>
    </div>`;
  }

  function render() {
    // Badge do cabeçalho
    const badge = document.querySelector('#badgeCarrinho');
    const n = totalItens();
    if (badge) {
      badge.textContent = n;
      badge.hidden = n === 0;
    }
    const qtdTopo = document.querySelector('#carrinhoQtdItens');
    if (qtdTopo) {
      qtdTopo.textContent = `${n} ${n === 1 ? 'item' : 'itens'}`;
      qtdTopo.hidden = n === 0;
    }

    const alvo = document.querySelector('#carrinhoConteudo');
    if (!alvo) return;

    if (vazio()) {
      alvo.innerHTML = `
        <div class="carrinho-vazio">
          <span class="icone">🛍️</span>
          <h3>Seu carrinho está vazio</h3>
          <p>Escolha seus perfumes favoritos e eles aparecem aqui.</p>
          <button type="button" class="btn btn-ouro" data-bs-dismiss="offcanvas">Ver produtos</button>
        </div>`;
      return;
    }

    const lista = detalhado();
    alvo.innerHTML = `
      <div class="carrinho-itens">${lista.map(itemHTML).join('')}</div>
      <div class="carrinho-rodape">
        <div class="linha-total"><span>Subtotal (${n} ${n === 1 ? 'item' : 'itens'})</span><span>${brl(totalValor())}</span></div>
        <div class="linha-total"><span>Frete</span><span class="gratis">Calculado no checkout</span></div>
        <div class="linha-total principal"><span>Total dos produtos</span><b>${brl(totalValor())}</b></div>
        <button type="button" class="btn btn-ouro btn-bloco btn-lg" id="btnIrCheckout">Finalizar pedido</button>
        <button type="button" class="btn btn-neutro btn-bloco btn-sm" id="btnLimparCarrinho">Esvaziar carrinho</button>
        <p class="aviso">🚚 Entrega grátis em Santa Fé do Sul e região.<br>Nenhum pagamento é feito no site.</p>
      </div>`;
  }

  /* -------------------------------------------------------------- EVENTOS */
  function ligarEventos() {
    const drawer = document.querySelector('#carrinhoDrawer');
    if (!drawer) return;

    drawer.addEventListener('click', ev => {
      const mais    = ev.target.closest('[data-mais]');
      const menos   = ev.target.closest('[data-menos]');
      const remove  = ev.target.closest('[data-remover]');
      const limparB = ev.target.closest('#btnLimparCarrinho');
      const irCheck = ev.target.closest('#btnIrCheckout');

      if (mais)  { const i = itens.find(x => x.id === mais.dataset.mais);   definirQtd(mais.dataset.mais, (i?.qtd || 0) + 1); }
      if (menos) { const i = itens.find(x => x.id === menos.dataset.menos); definirQtd(menos.dataset.menos, (i?.qtd || 0) - 1); }
      if (remove) remover(remove.dataset.remover);

      if (limparB) {
        if (confirm('Deseja remover todos os produtos do carrinho?')) {
          limpar();
          toast('Carrinho esvaziado', '', '🗑️');
        }
      }

      if (irCheck) {
        SF.drawerCarrinho.hide();
        setTimeout(() => Checkout.abrir(), 320);
      }
    });

    drawer.addEventListener('change', ev => {
      const campo = ev.target.closest('[data-qtd]');
      if (campo) definirQtd(campo.dataset.qtd, campo.value);
    });
  }

  /* ---------------------------------------------------------------- INÍCIO */
  function iniciar() {
    carregar();
    render();
    ligarEventos();
  }

  return { iniciar, adicionar, remover, definirQtd, limpar, detalhado, totalItens, totalValor, vazio, render };
})();
