/* =============================================================================
   SF PARFUMS — admin.js
   Ferramenta interna: monta o catálogo e gera o conteúdo de js/produtos.js.
   Não faz parte da loja pública — nada aqui é carregado pelo index.html.
============================================================================= */
'use strict';

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

let linhas = [];   // produtos em edição
let contador = 0;  // gera ids sequenciais por categoria

const PREFIXO = { 'arabes': 'ar', 'brand-collection': 'bc', 'importados': 'im', 'victorias-secret': 'vs' };

/* ------------------------------------------------------------- UTILITÁRIOS */
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Aceita "189,90", "R$ 189,90", "189.90" e devolve número. */
function lerPreco(valor) {
  if (typeof valor === 'number') return valor;
  const limpo = String(valor || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

function toast(msg, tipo = '', icone = '') {
  const caixa = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast-sf ${tipo}`.trim();
  el.innerHTML = `${icone ? `<span class="ic">${icone}</span>` : ''}<span>${esc(msg)}</span>`;
  caixa.appendChild(el);
  setTimeout(() => { el.classList.add('saindo'); el.addEventListener('animationend', () => el.remove(), { once:true }); }, 2600);
}

/* ------------------------------------------------------------------- TEMA */
(function tema() {
  const CHAVE = 'sf_parfums_tema';
  const aplicar = t => {
    document.documentElement.setAttribute('data-tema', t);
    $('#iconeTema')?.querySelector('use')?.setAttribute('href', t === 'escuro' ? '#ic-sol' : '#ic-lua');
  };
  let salvo = null;
  try { salvo = localStorage.getItem(CHAVE); } catch (e) {}
  aplicar(salvo || 'claro');
  $('#btnTema')?.addEventListener('click', () => {
    const novo = document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    try { localStorage.setItem(CHAVE, novo); } catch (e) {}
  });
})();

/* ------------------------------------------------------------------ TABELA */
function novoId(categoria) {
  const pre = PREFIXO[categoria] || 'pr';
  const usados = linhas.filter(l => l.categoria === categoria).length + 1;
  contador += 1;
  return `${pre}-${String(usados).padStart(3, '0')}-${contador}`;
}

function linhaVazia(categoria = CATEGORIAS[0].slug) {
  return { id: novoId(categoria), nome:'', categoria, preco:'', precoAntigo:'', volume:'', descricao:'', imagem:'', destaque:false, estoque:true };
}

function opcoesCategoria(selecionada) {
  return CATEGORIAS.map(c => `<option value="${c.slug}"${c.slug === selecionada ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
}

function renderTabela() {
  const corpo = $('#corpoTabela');
  corpo.innerHTML = linhas.map((l, i) => `
    <tr data-i="${i}">
      <td><input data-campo="nome"        value="${esc(l.nome)}" placeholder="Nome do perfume"></td>
      <td><select data-campo="categoria">${opcoesCategoria(l.categoria)}</select></td>
      <td><input data-campo="preco"       value="${esc(l.preco)}" placeholder="189,90" inputmode="decimal"></td>
      <td><input data-campo="precoAntigo" value="${esc(l.precoAntigo)}" placeholder="—" inputmode="decimal"></td>
      <td><input data-campo="volume"      value="${esc(l.volume)}" placeholder="100ml"></td>
      <td><input data-campo="descricao"   value="${esc(l.descricao)}" placeholder="Opcional"></td>
      <td><input data-campo="imagem"      value="${esc(l.imagem)}" placeholder="https://..."></td>
      <td style="text-align:center"><input type="checkbox" data-campo="destaque" ${l.destaque ? 'checked' : ''} style="width:auto;transform:scale(1.3)"></td>
      <td style="text-align:center"><input type="checkbox" data-campo="estoque"  ${l.estoque  ? 'checked' : ''} style="width:auto;transform:scale(1.3)"></td>
      <td class="acao">
        <button type="button" class="btn-remover" data-remover="${i}" aria-label="Remover linha">
          <svg><use href="#ic-lixo"></use></svg>
        </button>
      </td>
    </tr>`).join('');

  const porCategoria = CATEGORIAS
    .map(c => `${c.nome}: ${linhas.filter(l => l.categoria === c.slug).length}`)
    .join('  ·  ');
  $('#resumoTabela').textContent = `${linhas.length} produto(s)  —  ${porCategoria}`;
}

/* ------------------------------------------------------------- IMPORTAÇÃO */
function importarTexto() {
  const categoria = $('#inCategoriaImport').value;
  const texto = $('#txtImport').value.trim();
  if (!texto) { toast('Cole ao menos uma linha de produto.', 'erro', '⚠️'); return; }

  let importados = 0;
  texto.split('\n').forEach(bruta => {
    const linha = bruta.trim();
    if (!linha) return;
    // Aceita separadores | ; ou tabulação
    const partes = linha.split(/\s*[|;\t]\s*/);
    const nome = (partes[0] || '').trim();
    if (!nome) return;
    linhas.push({
      id: novoId(categoria),
      nome,
      categoria,
      preco: partes[1] ? String(lerPreco(partes[1])).replace('.', ',') : '',
      precoAntigo: '',
      volume: (partes[2] || '').trim(),
      descricao: (partes[3] || '').trim(),
      imagem: (partes[4] || '').trim(),
      destaque: false,
      estoque: true
    });
    importados += 1;
  });

  renderTabela();
  $('#txtImport').value = '';
  toast(`${importados} produto(s) importado(s) para ${CATEGORIAS.find(c => c.slug === categoria).nome}.`, 'sucesso', '✅');
}

/* --------------------------------------------------------- GERAÇÃO DO ARQUIVO */
function gerarCodigo() {
  const validos = linhas.filter(l => l.nome.trim());
  if (validos.length === 0) { toast('Cadastre ao menos um produto com nome.', 'erro', '⚠️'); return ''; }

  const semPreco = validos.filter(l => lerPreco(l.preco) <= 0);
  if (semPreco.length) {
    toast(`${semPreco.length} produto(s) sem preço — confira antes de publicar.`, 'erro', '⚠️');
  }

  // Reindexa os ids por categoria, deixando o arquivo final organizado.
  const contagem = {};
  const porCategoria = CATEGORIAS.map(cat => {
    const doGrupo = validos.filter(l => l.categoria === cat.slug);
    if (doGrupo.length === 0) return '';
    const itens = doGrupo.map(l => {
      contagem[cat.slug] = (contagem[cat.slug] || 0) + 1;
      const id = `${PREFIXO[cat.slug] || 'pr'}-${String(contagem[cat.slug]).padStart(3, '0')}`;
      const txt = v => JSON.stringify(String(v ?? '').trim());
      const antigo = lerPreco(l.precoAntigo);
      return `    { id:${txt(id)}, nome:${txt(l.nome)}, categoria:${txt(cat.slug)}, `
           + `preco:${lerPreco(l.preco).toFixed(2)}, precoAntigo:${antigo > 0 ? antigo.toFixed(2) : 'null'}, `
           + `volume:${txt(l.volume)}, descricao:${txt(l.descricao)}, imagem:${txt(l.imagem)}, `
           + `destaque:${!!l.destaque}, estoque:${!!l.estoque} }`;
    }).join(',\n');
    const titulo = cat.nome.toUpperCase();
    return `    /* ${'-'.repeat(Math.max(2, 66 - titulo.length))} ${titulo} */\n${itens}`;
  }).filter(Boolean).join(',\n\n');

  const codigo =
`/* =============================================================================
   SF PARFUMS — CATÁLOGO DE PRODUTOS
   Gerado pela ferramenta admin.html em ${new Date().toLocaleString('pt-BR')}.
   Total: ${validos.length} produto(s).
============================================================================= */

const CATEGORIAS = ${JSON.stringify(CATEGORIAS, null, 2).replace(/\n/g, '\n')};

const CATALOGO = {
  /* Catálogo real cadastrado — o aviso de demonstração fica desligado. */
  modoDemonstracao: false,

  produtos: [
${porCategoria}
  ]
};

/* =============================================================================
   CONFIGURAÇÃO DA LOJA
============================================================================= */
const LOJA = ${JSON.stringify(LOJA, null, 2)};
`;

  $('#saida').value = codigo;
  toast(`Código gerado com ${validos.length} produto(s).`, 'sucesso', '✅');
  return codigo;
}

/* ------------------------------------------------------------------ EVENTOS */
document.addEventListener('DOMContentLoaded', () => {
  $('#inCategoriaImport').innerHTML = CATEGORIAS.map(c => `<option value="${c.slug}">${esc(c.nome)}</option>`).join('');

  if (linhas.length === 0) linhas.push(linhaVazia());
  renderTabela();

  // Edição em linha
  $('#corpoTabela').addEventListener('input', ev => {
    const campo = ev.target.closest('[data-campo]');
    if (!campo) return;
    const i = Number(campo.closest('tr').dataset.i);
    const chave = campo.dataset.campo;
    linhas[i][chave] = campo.type === 'checkbox' ? campo.checked : campo.value;
  });
  $('#corpoTabela').addEventListener('change', ev => {
    const campo = ev.target.closest('[data-campo]');
    if (!campo) return;
    const i = Number(campo.closest('tr').dataset.i);
    linhas[i][campo.dataset.campo] = campo.type === 'checkbox' ? campo.checked : campo.value;
    if (campo.dataset.campo === 'categoria') renderTabela();
  });
  $('#corpoTabela').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-remover]');
    if (!btn) return;
    linhas.splice(Number(btn.dataset.remover), 1);
    renderTabela();
  });

  $('#btnNovaLinha').addEventListener('click', () => {
    linhas.push(linhaVazia($('#inCategoriaImport').value));
    renderTabela();
    $('#corpoTabela tr:last-child input')?.focus();
  });

  $('#btnCarregarAtual').addEventListener('click', () => {
    linhas = CATALOGO.produtos.map(p => ({
      id: p.id, nome: p.nome, categoria: p.categoria,
      preco: String(p.preco ?? '').replace('.', ','),
      precoAntigo: p.precoAntigo ? String(p.precoAntigo).replace('.', ',') : '',
      volume: p.volume || '', descricao: p.descricao || '', imagem: p.imagem || '',
      destaque: !!p.destaque, estoque: p.estoque !== false
    }));
    renderTabela();
    toast(`${linhas.length} produto(s) carregado(s) do catálogo atual.`, 'sucesso', '📥');
  });

  $('#btnLimparTabela').addEventListener('click', () => {
    if (!confirm('Limpar todos os produtos da tabela? O arquivo js/produtos.js não é alterado.')) return;
    linhas = [linhaVazia()];
    renderTabela();
  });

  $('#btnImportar').addEventListener('click', importarTexto);
  $('#btnGerar').addEventListener('click', gerarCodigo);

  $('#btnCopiar').addEventListener('click', async () => {
    const texto = $('#saida').value || gerarCodigo();
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast('Código copiado! Cole em js/produtos.js', 'sucesso', '📋');
    } catch (e) {
      $('#saida').select();
      toast('Selecione o texto e copie com Ctrl+C.', '', '📋');
    }
  });

  $('#btnBaixar').addEventListener('click', () => {
    const texto = $('#saida').value || gerarCodigo();
    if (!texto) return;
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/javascript;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'produtos.js';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Arquivo produtos.js baixado. Substitua o da pasta js/', 'sucesso', '💾');
  });
});
