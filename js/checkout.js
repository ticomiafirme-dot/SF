/* =============================================================================
   SF PARFUMS — checkout.js
   Fluxo de finalização em 4 etapas: dados → entrega → pagamento → revisão,
   escolha do vendedor e geração da mensagem de pedido para o WhatsApp.
============================================================================= */
'use strict';

const Checkout = (() => {
  const CHAVE_CLIENTE = 'sf_parfums_cliente';
  const TOTAL_ETAPAS = 4;
  let etapa = 1;

  /* ------------------------------------------------------------- ESTADO */
  const estado = {
    nome: '', cidade: '', cidadeOutra: '', modalidade: '',
    cep: '', rua: '', numero: '', bairro: '', uf: '', complemento: '',
    pagamento: ''
  };

  /** A cidade escolhida está na lista de entrega gratuita? */
  const temFreteGratis = () => LOJA.cidadesFreteGratis.includes(estado.cidade);

  /** Nome da cidade que vai no pedido (a digitada, quando o cliente marcou "Outros"). */
  const cidadeFinal = () => (estado.cidade === 'Outros' ? estado.cidadeOutra.trim() : estado.cidade);

  /* ------------------------------------------------------- VALIDAÇÃO BASE */
  function marcarErro(idCampo, temErro, mensagem) {
    const campo = $(idCampo);
    if (!campo) return;
    campo.classList.toggle('invalido', temErro);
    if (mensagem) {
      const msg = campo.querySelector('.erro-msg');
      if (msg) msg.textContent = mensagem;
    }
  }

  function limparErros() {
    $$('.campo.invalido').forEach(c => c.classList.remove('invalido'));
  }

  const cepLimpo = () => estado.cep.replace(/\D/g, '');

  /** O endereço só é exigido quando o cliente escolhe entrega. */
  const precisaEndereco = () => estado.modalidade === 'entrega';

  /* -------------------------------------------------- VALIDAÇÃO POR ETAPA */
  function validarEtapa(n) {
    limparErros();
    let ok = true;
    const falhar = (campo, msg) => { marcarErro(campo, true, msg); ok = false; };

    if (n === 1) {
      const nome = estado.nome.trim();
      if (nome.length < 3 || !nome.includes(' ')) {
        falhar('#campoNome', 'Informe seu nome completo (nome e sobrenome).');
      }
      if (!estado.cidade) {
        falhar('#campoCidade', 'Selecione sua cidade para calcularmos a entrega.');
      }
      if (estado.cidade === 'Outros' && estado.cidadeOutra.trim().length < 2) {
        falhar('#campoCidadeOutra', 'Informe o nome da sua cidade.');
      }
    }

    if (n === 2) {
      if (!estado.modalidade) {
        falhar('#campoModalidade', 'Escolha entre entrega e retirada.');
      }
      if (precisaEndereco()) {
        if (cepLimpo().length !== 8) falhar('#campoCep', 'Informe um CEP válido com 8 dígitos.');
        if (!estado.rua.trim())      falhar('#campoRua', 'Informe a rua.');
        if (!estado.numero.trim())   falhar('#campoNumero', 'Informe o número.');
        if (!estado.bairro.trim())   falhar('#campoBairro', 'Informe o bairro.');
      }
    }

    if (n === 3 && !estado.pagamento) {
      falhar('#campoPagamento', 'Selecione uma forma de pagamento.');
    }

    if (!ok) {
      $('.campo.invalido')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Confira os campos destacados.', 'erro', '⚠️');
    }
    return ok;
  }

  /* ------------------------------------------------------ NAVEGAÇÃO ETAPAS */
  function mostrarEtapa(n) {
    etapa = Math.min(TOTAL_ETAPAS, Math.max(1, n));

    $$('.etapa').forEach(sec => sec.classList.toggle('ativa', Number(sec.dataset.etapa) === etapa));
    $$('.passo').forEach(p => {
      const num = Number(p.dataset.passo);
      p.classList.toggle('atual', num === etapa);
      p.classList.toggle('feito', num < etapa);
    });

    $('#btnVoltarEtapa').textContent = etapa === 1 ? 'Cancelar' : 'Voltar';
    $('#btnAvancarEtapa').textContent = etapa === TOTAL_ETAPAS ? 'Confirmar pedido' : 'Continuar';

    if (etapa === TOTAL_ETAPAS) montarRevisao();
    $('.checkout-corpo')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function avancar() {
    if (!validarEtapa(etapa)) return;
    if (etapa === TOTAL_ETAPAS) { escolherVendedor(); return; }
    salvarCliente();
    mostrarEtapa(etapa + 1);
  }

  function voltar() {
    if (etapa === 1) { SF.modais.checkout.hide(); return; }
    mostrarEtapa(etapa - 1);
  }

  /* ------------------------------------------------- CIDADE / FRETE / ENTREGA */
  function montarSelectCidades() {
    const sel = $('#inCidade');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione sua cidade...</option>'
      + LOJA.cidadesFreteGratis.map(c => `<option value="${esc(c)}">${esc(c)} — entrega grátis</option>`).join('')
      + '<option value="Outros">Outros (outra cidade)</option>';
  }

  /** Reflete na tela o efeito da cidade escolhida: frete, avisos e campos extras. */
  function atualizarPorCidade() {
    const outros = estado.cidade === 'Outros';
    const gratis = temFreteGratis();

    $('#campoCidadeOutra').hidden = !outros;
    $('#avisoFreteGratis').hidden = !gratis;
    $('#avisoFreteCombinar').hidden = !outros;
    if (gratis) $('#nomeCidadeGratis').textContent = estado.cidade;

    // A opção de entrega muda de etiqueta conforme a cidade
    const tag = $('#tagEntrega');
    const sub = $('#subEntrega');
    if (outros) {
      tag.textContent = 'Frete a combinar';
      tag.className = 'tag combinar';
      sub.textContent = 'O valor do frete é combinado com o vendedor pelo WhatsApp — ele verifica a melhor forma de envio, inclusive pelos Correios.';
    } else if (gratis) {
      tag.textContent = 'Grátis';
      tag.className = 'tag gratis';
      sub.textContent = `Entrega grátis para sua cidade — ${estado.cidade}.`;
    } else {
      tag.textContent = 'Grátis';
      tag.className = 'tag gratis';
      sub.textContent = 'Entregamos no seu endereço.';
    }
  }

  /** Mostra ou esconde o bloco de endereço conforme entrega/retirada. */
  function atualizarPorModalidade() {
    const entrega = estado.modalidade === 'entrega';
    $('#blocoEndereco').hidden = !entrega;
    $('#avisoRetirada').hidden = estado.modalidade !== 'retirada';
  }

  /* --------------------------------------------------------- CEP (ViaCEP) */
  function formatarCep(valor) {
    const d = valor.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  async function buscarCep() {
    const cep = cepLimpo();
    const dica = $('#dicaCep');
    if (cep.length !== 8) {
      marcarErro('#campoCep', true, 'Informe um CEP válido com 8 dígitos.');
      return;
    }
    marcarErro('#campoCep', false);
    dica.textContent = 'Buscando endereço...';
    $('#btnBuscarCep').disabled = true;

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (dados.erro) throw new Error('CEP não encontrado');

      if (dados.logradouro) { estado.rua = dados.logradouro; $('#inRua').value = dados.logradouro; }
      if (dados.bairro)     { estado.bairro = dados.bairro;  $('#inBairro').value = dados.bairro; }
      if (dados.uf)         { estado.uf = dados.uf;          $('#inUf').value = dados.uf; }
      // Para "Outros", o CEP também confirma o nome da cidade.
      if (dados.localidade && estado.cidade === 'Outros' && !estado.cidadeOutra.trim()) {
        estado.cidadeOutra = dados.localidade;
        $('#inCidadeOutra').value = dados.localidade;
      }

      dica.textContent = 'Endereço preenchido. Confira e complete o número.';
      toast('Endereço encontrado!', 'sucesso', '📍');
      if (!estado.numero) $('#inNumero').focus();
    } catch (e) {
      // Sem internet ou CEP inexistente: o cliente preenche à mão, sem travar o pedido.
      dica.textContent = 'Não conseguimos buscar automaticamente. Preencha o endereço manualmente.';
      toast('CEP não encontrado. Preencha manualmente.', 'erro', '⚠️');
    } finally {
      $('#btnBuscarCep').disabled = false;
    }
  }

  /* ------------------------------------------------------------- REVISÃO */
  function montarRevisao() {
    const itens = Carrinho.detalhado();

    $('#revProdutos').innerHTML = itens.map(p => `
      <li>
        <span>${esc(p.nome)} <span style="color:var(--texto-fraco)">× ${p.qtd}</span></span>
        <b>${brl(p.subtotal)}</b>
      </li>`).join('');
    $('#revTotal').textContent = brl(Carrinho.totalValor());

    const linha = (rot, val) => `<div class="resumo-linha"><span class="rot">${rot}</span><span class="val">${esc(val)}</span></div>`;
    let cliente = linha('Nome', estado.nome.trim()) + linha('Cidade', cidadeFinal());

    if (estado.modalidade === 'retirada') {
      cliente += linha('Modalidade', '🏪 Retirada');
      cliente += `<div class="resumo-linha"><span class="rot">Local</span><span class="val">Combinado no WhatsApp</span></div>`;
    } else {
      cliente += linha('Modalidade', '🚚 Entrega');
      cliente += linha('CEP', formatarCep(estado.cep));
      cliente += linha('Endereço', `${estado.rua.trim()}, ${estado.numero.trim()}`);
      cliente += linha('Bairro', estado.bairro.trim());
      if (estado.uf.trim()) cliente += linha('Estado', estado.uf.trim().toUpperCase());
      if (estado.complemento.trim()) cliente += linha('Complemento', estado.complemento.trim());
      cliente += estado.cidade === 'Outros'
        ? `<div class="resumo-linha"><span class="rot">Frete</span><span class="val" style="color:var(--alerta);font-weight:700">A combinar com o vendedor</span></div>`
        : `<div class="resumo-linha"><span class="rot">Frete</span><span class="val" style="color:var(--sucesso);font-weight:700">GRÁTIS</span></div>`;
    }
    $('#revCliente').innerHTML = cliente;
    $('#revPagamento').innerHTML = linha('Forma escolhida', estado.pagamento)
      + `<div class="resumo-linha"><span class="rot">Observação</span><span class="val" style="color:var(--texto-fraco)">O pagamento é acertado diretamente com o vendedor.</span></div>`;
  }

  /* ------------------------------------------ MENSAGEM DE PEDIDO (WHATSAPP) */
  function montarMensagem(vendedor) {
    const itens = Carrinho.detalhado();
    const L = [];

    L.push('🛍️ *NOVO PEDIDO — SF PARFUMS*');
    L.push('');
    L.push(`👤 *Cliente:* ${estado.nome.trim()}`);
    L.push('');
    L.push('🛒 *PRODUTOS:*');
    itens.forEach(p => {
      L.push(`• ${p.nome}${p.volume ? ` (${p.volume})` : ''} — Quantidade: ${p.qtd} — ${brl(p.subtotal)}`);
    });
    L.push('');
    L.push(`💰 *TOTAL DOS PRODUTOS:* ${brl(Carrinho.totalValor())}`);
    L.push('');
    L.push(`💳 *PAGAMENTO:* ${estado.pagamento}`);
    L.push('');
    L.push(`📍 *CIDADE:* ${cidadeFinal()}`);

    if (estado.modalidade === 'entrega') {
      L.push(`📮 *CEP:* ${formatarCep(estado.cep)}`);
      L.push('');
      L.push(`🏠 *ENDEREÇO:* ${estado.rua.trim()}`);
      L.push(`🔢 *NÚMERO:* ${estado.numero.trim()}`);
      L.push(`📌 *BAIRRO:* ${estado.bairro.trim()}`);
      if (estado.complemento.trim()) L.push(`➕ *COMPLEMENTO:* ${estado.complemento.trim()}`);
      if (estado.uf.trim())          L.push(`🗺️ *ESTADO:* ${estado.uf.trim().toUpperCase()}`);
      L.push('');
      L.push('🚚 *MODALIDADE:* Entrega');
      L.push(estado.cidade === 'Outros'
        ? '⚠️ *FRETE:* A COMBINAR COM O VENDEDOR'
        : '✅ *FRETE:* GRÁTIS');
    } else {
      L.push('');
      L.push('🏪 *MODALIDADE:* Retirada');
    }

    L.push('');
    L.push(`👨‍💼 *ATENDIMENTO:* ${vendedor.nome}`);
    L.push('');
    L.push('Obrigado por comprar na SF PARFUMS! ✨');

    return L.join('\n');
  }

  /* ------------------------------------------------- ESCOLHA DO VENDEDOR */
  function escolherVendedor() {
    salvarCliente();
    $('#listaVendedores').innerHTML = LOJA.vendedores.map(v => `
      <button type="button" class="card-vendedor" data-vendedor="${esc(v.id)}">
        <span class="avatar">${esc(v.nome.split(' ').map(x => x[0]).slice(0, 2).join(''))}</span>
        <span class="txt">
          <span class="nome">👤 ${esc(v.nome)}</span>
          <span class="fone"><svg width="14" height="14" aria-hidden="true"><use href="#ic-zap"></use></svg> WhatsApp: ${esc(v.exibicao)}</span>
        </span>
        <span class="seta"><svg aria-hidden="true"><use href="#ic-seta"></use></svg></span>
      </button>`).join('');

    SF.modais.checkout.hide();
    setTimeout(() => SF.modais.vendedor.show(), 300);
  }

  function enviarPedido(idVendedor) {
    const vendedor = LOJA.vendedores.find(v => v.id === idVendedor);
    if (!vendedor) return;

    const url = `https://wa.me/${vendedor.telefone}?text=${encodeURIComponent(montarMensagem(vendedor))}`;
    // Abre em nova aba; se o navegador bloquear o popup, navega na própria aba.
    const aba = window.open(url, '_blank');
    if (!aba) window.location.href = url;

    SF.modais.vendedor.hide();
    toast(`Pedido enviado para ${vendedor.nome}!`, 'sucesso', '✅');
  }

  /* -------------------------------------------- DADOS SALVOS DO CLIENTE */
  function salvarCliente() {
    try {
      localStorage.setItem(CHAVE_CLIENTE, JSON.stringify({
        nome: estado.nome, cidade: estado.cidade, cidadeOutra: estado.cidadeOutra,
        cep: estado.cep, rua: estado.rua, numero: estado.numero,
        bairro: estado.bairro, uf: estado.uf, complemento: estado.complemento
      }));
    } catch (e) { /* ignora */ }
  }

  function recuperarCliente() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE_CLIENTE) || '{}');
      Object.keys(dados).forEach(k => { if (k in estado && typeof dados[k] === 'string') estado[k] = dados[k]; });
    } catch (e) { /* ignora */ }

    $('#inNome').value        = estado.nome;
    $('#inCidade').value      = estado.cidade;
    $('#inCidadeOutra').value = estado.cidadeOutra;
    $('#inCep').value         = formatarCep(estado.cep);
    $('#inRua').value         = estado.rua;
    $('#inNumero').value      = estado.numero;
    $('#inBairro').value      = estado.bairro;
    $('#inUf').value          = estado.uf;
    $('#inComplemento').value = estado.complemento;
    atualizarPorCidade();
  }

  /* --------------------------------------------------------------- ABRIR */
  function abrir() {
    if (Carrinho.vazio()) {
      toast('Seu carrinho está vazio. Escolha um perfume primeiro.', 'erro', '🛍️');
      SF.drawerCarrinho.show();
      return;
    }
    limparErros();
    mostrarEtapa(1);
    SF.modais.checkout.show();
  }

  /* ------------------------------------------------------------- EVENTOS */
  function ligarEventos() {
    // Campos de texto → estado
    const textos = {
      '#inNome': 'nome', '#inCidadeOutra': 'cidadeOutra', '#inRua': 'rua',
      '#inNumero': 'numero', '#inBairro': 'bairro', '#inUf': 'uf', '#inComplemento': 'complemento'
    };
    Object.entries(textos).forEach(([sel, chave]) => {
      $(sel)?.addEventListener('input', e => {
        estado[chave] = e.target.value;
        e.target.closest('.campo')?.classList.remove('invalido');
      });
    });

    // Cidade
    $('#inCidade')?.addEventListener('change', e => {
      estado.cidade = e.target.value;
      $('#campoCidade').classList.remove('invalido');
      atualizarPorCidade();
    });

    // Modalidade: entrega ou retirada
    $$('input[name="modalidade"]').forEach(r => r.addEventListener('change', e => {
      estado.modalidade = e.target.value;
      $('#campoModalidade').classList.remove('invalido');
      atualizarPorModalidade();
    }));

    // Pagamento
    $$('input[name="pagamento"]').forEach(r => r.addEventListener('change', e => {
      estado.pagamento = e.target.value;
      $('#campoPagamento').classList.remove('invalido');
    }));

    // CEP: máscara, busca automática ao completar 8 dígitos e botão manual
    const inCep = $('#inCep');
    inCep?.addEventListener('input', e => {
      e.target.value = formatarCep(e.target.value);
      estado.cep = e.target.value;
      $('#campoCep').classList.remove('invalido');
      if (cepLimpo().length === 8) buscarCep();
    });
    inCep?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarCep(); } });
    $('#btnBuscarCep')?.addEventListener('click', buscarCep);

    // Navegação do assistente
    $('#btnAvancarEtapa')?.addEventListener('click', avancar);
    $('#btnVoltarEtapa')?.addEventListener('click', voltar);
    $('#formCheckout')?.addEventListener('submit', e => { e.preventDefault(); avancar(); });

    // Atalhos "Editar" da revisão
    $$('[data-ir]').forEach(btn => btn.addEventListener('click', () => {
      const destino = btn.dataset.ir;
      if (destino === 'carrinho') {
        SF.modais.checkout.hide();
        setTimeout(() => SF.drawerCarrinho.show(), 300);
      } else {
        mostrarEtapa(Number(destino));
      }
    }));

    // Escolha do vendedor
    $('#listaVendedores')?.addEventListener('click', ev => {
      const card = ev.target.closest('[data-vendedor]');
      if (card) enviarPedido(card.dataset.vendedor);
    });

    // Ao reabrir o checkout, o total precisa refletir o carrinho atual
    $('#modalCheckout')?.addEventListener('show.bs.modal', () => {
      if (etapa === TOTAL_ETAPAS) montarRevisao();
    });
  }

  /* ---------------------------------------------------------------- INÍCIO */
  function iniciar() {
    montarSelectCidades();
    recuperarCliente();
    atualizarPorModalidade();
    ligarEventos();
  }

  return { iniciar, abrir, montarMensagem, estado };
})();
