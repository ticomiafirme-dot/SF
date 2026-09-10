/* =============================================================================
   SF PARFUMS — dados.js
   Camada de dados única, usada TANTO pela loja pública quanto pelo painel.
   Nada de produto ou categoria fica fixo no HTML: tudo vem daqui.

   Dois adaptadores, escolhidos automaticamente:

   • firebase — ativo quando FIREBASE_CONFIG está preenchido em js/produtos.js.
                Grava no Firestore, então o que o administrador publica aparece
                para todos os clientes, em qualquer aparelho, na hora.
   • local    — usado quando não há configuração do Firebase. Grava no navegador
                (localStorage). Serve para testar e para uso em um só aparelho.

   Em ambos os casos o localStorage funciona como cache: a loja abre instantânea
   com o último catálogo conhecido e se atualiza quando o servidor responde.
============================================================================= */
'use strict';

const DB = (() => {
  const CHAVE_CACHE = 'sf_parfums_catalogo';   // cache de tela, nunca fonte de verdade
  const CHAVE_CONFIG = 'sf_parfums_firebase';  // configuração colada no painel para testar
  const COL_CATEGORIAS = 'categorias';
  const COL_PRODUTOS = 'produtos';

  let estado = { categorias: [], produtos: [] };
  let modo = 'local';           // 'local' | 'firebase'
  let fs = null;                // instância do Firestore
  const ouvintes = [];          // callbacks avisados a cada mudança

  /* ===================================================================
     UTILITÁRIOS
  =================================================================== */

  /** Converte um nome em identificador de URL: "Importados Plus" → "importados-plus" */
  function gerarSlug(texto) {
    return String(texto || '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'estilo';
  }

  /** Identificador único para um novo registro. */
  function gerarId(prefixo) {
    return `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Preço que o cliente realmente paga (considera a promoção). */
  function precoFinal(p) {
    const promo = Number(p?.precoPromocional) || 0;
    const normal = Number(p?.preco) || 0;
    return promo > 0 && promo < normal ? promo : normal;
  }

  /** Preço riscado ao lado, quando há promoção ativa. Retorna null se não houver. */
  function precoRiscado(p) {
    const promo = Number(p?.precoPromocional) || 0;
    const normal = Number(p?.preco) || 0;
    return promo > 0 && promo < normal ? normal : null;
  }

  const emPromocao = p => precoRiscado(p) !== null;

  /* ===================================================================
     NORMALIZAÇÃO E MIGRAÇÃO
     Aceita registros antigos (que usavam precoAntigo) e completa os
     campos que passaram a existir, para nada quebrar ao atualizar.
  =================================================================== */
  function normalizarProduto(bruto, indice = 0) {
    const p = { ...bruto };

    // Antes: preco = valor cobrado, precoAntigo = valor riscado.
    // Agora: preco = valor normal, precoPromocional = valor cobrado na oferta.
    if (p.precoAntigo != null && Number(p.precoAntigo) > Number(p.preco)) {
      p.precoPromocional = Number(p.preco);
      p.preco = Number(p.precoAntigo);
    }
    delete p.precoAntigo;

    return {
      id:                p.id || gerarId('prod'),
      nome:              String(p.nome || '').trim(),
      marca:             String(p.marca || '').trim(),
      categoria:         String(p.categoria || '').trim(),
      preco:             Number(p.preco) || 0,
      precoPromocional:  Number(p.precoPromocional) || 0,
      volume:            String(p.volume || '').trim(),
      genero:            String(p.genero || '').trim(),
      notas:             String(p.notas || '').trim(),
      descricao:         String(p.descricao || '').trim(),
      imagem:            String(p.imagem || ''),
      imagensExtras:     Array.isArray(p.imagensExtras) ? p.imagensExtras.filter(Boolean) : [],
      destaque:          p.destaque === true,
      estoque:           p.estoque !== false,          // false = esgotado
      quantidade:        p.quantidade === '' || p.quantidade == null ? null : Number(p.quantidade),
      ativo:             p.ativo !== false,            // false = oculto da loja
      ordem:             Number.isFinite(p.ordem) ? p.ordem : indice,
      criadoEm:          p.criadoEm || new Date().toISOString(),
      atualizadoEm:      p.atualizadoEm || new Date().toISOString()
    };
  }

  function normalizarCategoria(bruto, indice = 0) {
    const c = { ...bruto };
    const nome = String(c.nome || '').trim();
    return {
      slug:      c.slug || gerarSlug(nome),
      nome,
      chamada:   String(c.chamada || '').trim(),
      descricao: String(c.descricao || '').trim(),
      icone:     String(c.icone || '✦'),
      imagem:    String(c.imagem || ''),
      ativo:     c.ativo !== false,
      ordem:     Number.isFinite(c.ordem) ? c.ordem : indice,
      criadoEm:  c.criadoEm || new Date().toISOString()
    };
  }

  function normalizarTudo(dados) {
    return {
      categorias: (dados.categorias || []).map(normalizarCategoria)
                    .sort((a, b) => a.ordem - b.ordem),
      produtos:   (dados.produtos || []).map(normalizarProduto)
                    .sort((a, b) => a.ordem - b.ordem)
    };
  }

  /* ===================================================================
     CACHE LOCAL
  =================================================================== */
  function lerCache() {
    try {
      const bruto = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null');
      if (bruto && Array.isArray(bruto.produtos)) return normalizarTudo(bruto);
    } catch (e) { /* cache inválido: ignora */ }
    return null;
  }

  function gravarCache() {
    try {
      localStorage.setItem(CHAVE_CACHE, JSON.stringify(estado));
    } catch (e) {
      // Cota estourada — quase sempre por fotos grandes demais.
      console.warn('[SF] Não foi possível salvar no navegador (espaço cheio).', e);
      return false;
    }
    return true;
  }

  /* ===================================================================
     IMAGENS
     Fotos são redimensionadas e comprimidas no próprio navegador antes de
     serem guardadas. Sem isso, uma foto de celular (5MB) estouraria tanto o
     limite do navegador quanto o de 1MB por documento do Firestore.
  =================================================================== */
  const IMG_LADO_MAX = 900;
  const IMG_QUALIDADE = 0.82;

  function comprimirImagem(arquivo, ladoMax = IMG_LADO_MAX) {
    return new Promise((resolve, reject) => {
      if (!arquivo || !arquivo.type?.startsWith('image/')) {
        reject(new Error('O arquivo escolhido não é uma imagem.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Imagem inválida ou corrompida.'));
        img.onload = () => {
          const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
          const l = Math.round(img.width * escala);
          const a = Math.round(img.height * escala);
          const tela = document.createElement('canvas');
          tela.width = l; tela.height = a;
          const ctx = tela.getContext('2d');
          ctx.fillStyle = '#ffffff';               // fundo para PNG transparente
          ctx.fillRect(0, 0, l, a);
          ctx.drawImage(img, 0, 0, l, a);
          resolve(tela.toDataURL('image/jpeg', IMG_QUALIDADE));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  /** Tamanho aproximado em KB de uma imagem em data URL. */
  function pesoImagemKB(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return 0;
    return Math.round((dataUrl.length * 3 / 4) / 1024);
  }

  /* ===================================================================
     FIREBASE — fonte de verdade do catálogo
     ===================================================================
     Quando há configuração, o Firestore manda: é dele que os dados vêm e é
     nele que as alterações são gravadas ANTES de aparecerem na tela. Assim
     o que o administrador publica vale para todos os aparelhos.
  =================================================================== */
  function firebaseConfigurado() {
    const c = configFirebase();
    return !!c && typeof c.projectId === 'string' && c.projectId.trim() !== ''
        && typeof firebase !== 'undefined';
  }

  /** Configuração vinda do arquivo do site ou, na ausência dela, a que o
      administrador colou no painel para testar antes de publicar o arquivo. */
  function configFirebase() {
    if (typeof FIREBASE_CONFIG === 'object' && FIREBASE_CONFIG
        && String(FIREBASE_CONFIG.projectId || '').trim() !== '') {
      return FIREBASE_CONFIG;
    }
    try {
      const salva = JSON.parse(localStorage.getItem(CHAVE_CONFIG) || 'null');
      if (salva && String(salva.projectId || '').trim() !== '') return salva;
    } catch (e) { /* ignora */ }
    return null;
  }

  /** Assina uma coleção. A primeira resposta resolve a promessa — assim uma
      única escuta serve para carregar e para receber as atualizações,
      pela metade das leituras de um get() seguido de onSnapshot(). */
  function escutar(colecao, aoReceber) {
    return new Promise((resolve, reject) => {
      let primeira = true;
      fs.collection(colecao).onSnapshot(
        snap => {
          aoReceber(snap);
          if (primeira) { primeira = false; resolve(snap); }
          else avisar();
        },
        err => {
          if (primeira) { primeira = false; reject(err); }
          else console.warn(`[SF] Escuta de ${colecao} interrompida:`, err);
        }
      );
    });
  }

  async function iniciarFirebase({ permitirSemear }) {
    const cfg = configFirebase();
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(cfg);
    fs = firebase.firestore();

    // Emulador local — só para testar o projeto na própria máquina.
    if (cfg.emulador) {
      const [host, porta] = String(cfg.emulador).split(':');
      fs.useEmulator(host || '127.0.0.1', Number(porta) || 8080);
    }

    const [catSnap, prodSnap] = await Promise.all([
      escutar(COL_CATEGORIAS, s => {
        estado.categorias = s.docs
          .map((d, i) => normalizarCategoria({ ...d.data(), slug: d.id }, i))
          .sort((a, b) => a.ordem - b.ordem);
        gravarCache();
      }),
      escutar(COL_PRODUTOS, s => {
        estado.produtos = s.docs
          .map((d, i) => normalizarProduto({ ...d.data(), id: d.id }, i))
          .sort((a, b) => a.ordem - b.ordem);
        gravarCache();
      })
    ]);

    modo = 'firebase';

    // Banco ainda vazio: só o painel semeia. Se a loja pública fizesse isso,
    // qualquer visitante estaria gravando no banco da loja.
    if (catSnap.empty && prodSnap.empty && permitirSemear) await semear();

    return modo;
  }

  /** Primeira carga do banco: sobe o catálogo que o administrador já tinha
      no navegador; se não houver nenhum, sobe o catálogo de exemplo. */
  async function semear() {
    const doNavegador = lerCache();
    const base = (doNavegador && doNavegador.produtos.length)
      ? doNavegador
      : normalizarTudo({ categorias: SEED_CATEGORIAS, produtos: SEED_PRODUTOS });

    const lote = fs.batch();
    base.categorias.forEach(c => {
      const { slug, ...resto } = c;
      lote.set(fs.collection(COL_CATEGORIAS).doc(slug), resto);
    });
    base.produtos.forEach(p => {
      const { id, ...resto } = p;
      lote.set(fs.collection(COL_PRODUTOS).doc(id), resto);
    });
    await lote.commit();   // a escuta devolve os dados gravados
  }

  /** Testa uma configuração colada no painel, sem alterar a sessão atual. */
  async function testarConexao(cfg) {
    if (typeof firebase === 'undefined') {
      throw new Error('A biblioteca do Firebase não carregou. Verifique sua conexão com a internet.');
    }
    if (!cfg || !String(cfg.projectId || '').trim()) {
      throw new Error('A configuração precisa conter o projectId.');
    }
    const nome = 'teste-' + Date.now();
    const app = firebase.initializeApp(cfg, nome);
    try {
      const banco = app.firestore();
      if (cfg.emulador) {
        const [h, p] = String(cfg.emulador).split(':');
        banco.useEmulator(h || '127.0.0.1', Number(p) || 8080);
      }
      // Uma leitura e uma gravação: confirma que as regras permitem as duas.
      await banco.collection(COL_PRODUTOS).limit(1).get();
      const ref = banco.collection('_teste_conexao').doc('ping');
      await ref.set({ em: new Date().toISOString() });
      await ref.delete();
      return true;
    } finally {
      await app.delete().catch(() => {});
    }
  }

  /** Guarda a configuração testada para este aparelho já funcionar.
      Para os demais aparelhos, ela precisa ir para js/produtos.js. */
  function salvarConfigLocal(cfg) {
    try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify(cfg)); return true; }
    catch (e) { return false; }
  }

  function limparConfigLocal() {
    try { localStorage.removeItem(CHAVE_CONFIG); } catch (e) { /* ignora */ }
  }

  /** A configuração está no arquivo do site (vale em todos os aparelhos)? */
  const configNoArquivo = () =>
    typeof FIREBASE_CONFIG === 'object' && FIREBASE_CONFIG
    && String(FIREBASE_CONFIG.projectId || '').trim() !== '';

  /* ===================================================================
     INÍCIO
     -------------------------------------------------------------------
     `permitirSemear` é ligado só pelo painel: a loja pública nunca grava.
  =================================================================== */
  async function iniciar({ permitirSemear = false } = {}) {
    // Pintura imediata com o último catálogo conhecido. É só cache de tela:
    // quando há Firebase, tudo abaixo é substituído pelo que vem do servidor.
    const cache = lerCache();
    if (cache) estado = cache;

    if (firebaseConfigurado()) {
      try {
        await iniciarFirebase({ permitirSemear });
        return { modo, erro: null };
      } catch (e) {
        // Falhar em silêncio aqui foi o que fez o administrador achar que
        // estava publicando quando nada saía do aparelho dele.
        console.error('[SF] Não foi possível conectar ao Firebase:', e);
        modo = 'local';
        ligarEscutaEntreAbas();
        return { modo, erro: e };
      }
    }

    // Sem Firebase: catálogo publicado no arquivo, quando não há cache.
    if (!cache) {
      let doArquivo = null;
      try {
        const r = await fetch('data/catalogo.json', { cache: 'no-store' });
        if (r.ok) doArquivo = await r.json();
      } catch (e) { /* aberto via file:// ou arquivo ausente */ }
      estado = normalizarTudo(doArquivo || { categorias: SEED_CATEGORIAS, produtos: SEED_PRODUTOS });
      gravarCache();
    }

    ligarEscutaEntreAbas();
    return { modo, erro: null };
  }

  /** Sem Firebase, ao menos as abas do mesmo navegador se acompanham. */
  function ligarEscutaEntreAbas() {
    window.addEventListener('storage', ev => {
      if (ev.key !== CHAVE_CACHE) return;
      const novo = lerCache();
      if (novo) { estado = novo; avisar(); }
    });
  }

  /* ===================================================================
     LEITURA
  =================================================================== */
  const todasCategorias = () => estado.categorias.map(c => ({ ...c }));
  const todosProdutos   = () => estado.produtos.map(p => ({ ...p }));

  /** Categorias visíveis na loja pública. */
  const categorias = () => estado.categorias.filter(c => c.ativo).map(c => ({ ...c }));

  /** Produtos visíveis na loja pública (ativos e de categoria ativa). */
  function produtos() {
    const ativas = new Set(estado.categorias.filter(c => c.ativo).map(c => c.slug));
    return estado.produtos
      .filter(p => p.ativo && ativas.has(p.categoria))
      .map(p => ({ ...p }));
  }

  const categoriaPorSlug = slug => estado.categorias.find(c => c.slug === slug) || null;
  const produtoPorId     = id   => estado.produtos.find(p => p.id === id) || null;

  const contarProdutos = slug =>
    produtos().filter(p => slug === 'todos' || p.categoria === slug).length;

  /* ===================================================================
     ESCRITA
  =================================================================== */
  /* Grava no servidor e deixa o erro subir. Antes, a tela era atualizada
     primeiro e uma falha de gravação passava despercebida: o administrador via
     "salvo com sucesso" e nada tinha saído do aparelho dele. */
  async function persistir(colecao, id, dados) {
    if (modo !== 'firebase' || !fs) return;
    const limpo = { ...dados };
    delete limpo.id; delete limpo.slug;
    await fs.collection(colecao).doc(id).set(limpo);
  }

  async function remover(colecao, id) {
    if (modo !== 'firebase' || !fs) return;
    await fs.collection(colecao).doc(id).delete();
  }

  /* ------------------------------------------------------- CATEGORIAS */
  async function salvarCategoria(dados) {
    const cat = normalizarCategoria(dados, estado.categorias.length);
    const i = estado.categorias.findIndex(c => c.slug === cat.slug);
    if (i >= 0) {
      cat.criadoEm = estado.categorias[i].criadoEm;
      cat.ordem = estado.categorias[i].ordem;
    }

    await persistir(COL_CATEGORIAS, cat.slug, cat);   // servidor primeiro

    if (i >= 0) estado.categorias[i] = cat; else estado.categorias.push(cat);
    gravarCache();
    avisar();
    return cat;
  }

  async function excluirCategoria(slug) {
    await remover(COL_CATEGORIAS, slug);
    estado.categorias = estado.categorias.filter(c => c.slug !== slug);
    gravarCache();
    avisar();
  }

  /** Quantos produtos usam esta categoria (inclui ocultos). */
  const produtosNaCategoria = slug => estado.produtos.filter(p => p.categoria === slug).length;

  /* --------------------------------------------------------- PRODUTOS */
  async function salvarProduto(dados) {
    const novo = !dados.id || !estado.produtos.some(p => p.id === dados.id);
    const prod = normalizarProduto(
      { ...dados, id: dados.id || gerarId('prod') },
      novo ? estado.produtos.length : 0
    );
    prod.atualizadoEm = new Date().toISOString();

    const i = estado.produtos.findIndex(p => p.id === prod.id);
    if (i >= 0) {
      prod.criadoEm = estado.produtos[i].criadoEm;
      prod.ordem = estado.produtos[i].ordem;
    }

    await persistir(COL_PRODUTOS, prod.id, prod);   // servidor primeiro

    if (i >= 0) estado.produtos[i] = prod; else estado.produtos.push(prod);
    gravarCache();
    avisar();
    return prod;
  }

  async function excluirProduto(id) {
    await remover(COL_PRODUTOS, id);
    estado.produtos = estado.produtos.filter(p => p.id !== id);
    gravarCache();
    avisar();
  }

  async function duplicarProduto(id) {
    const orig = produtoPorId(id);
    if (!orig) return null;
    return salvarProduto({
      ...orig,
      id: null,
      nome: `${orig.nome} (cópia)`,
      ativo: false,                 // a cópia nasce oculta, para revisão
      criadoEm: new Date().toISOString()
    });
  }

  async function alternarAtivo(id) {
    const p = produtoPorId(id);
    if (!p) return null;
    return salvarProduto({ ...p, ativo: !p.ativo });
  }

  /** Existe outro produto com este nome na mesma categoria? Evita duplicidade. */
  function nomeDuplicado(nome, categoria, idAtual = null) {
    const alvo = gerarSlug(nome);
    return estado.produtos.some(p =>
      p.id !== idAtual && p.categoria === categoria && gerarSlug(p.nome) === alvo);
  }

  /* ===================================================================
     BACKUP
  =================================================================== */
  const exportar = () => JSON.stringify(
    { versao: 2, exportadoEm: new Date().toISOString(), ...estado }, null, 2);

  async function importar(texto) {
    const bruto = JSON.parse(texto);
    if (!bruto || !Array.isArray(bruto.produtos) || !Array.isArray(bruto.categorias)) {
      throw new Error('Arquivo fora do formato esperado.');
    }
    const novo = normalizarTudo(bruto);
    if (modo === 'firebase' && fs) {
      await substituirTudoNoServidor(novo);   // erro sobe: nada muda na tela
    }
    estado = novo;
    gravarCache();
    avisar();
    return estado;
  }

  async function restaurarPadrao() {
    const padrao = normalizarTudo({ categorias: SEED_CATEGORIAS, produtos: SEED_PRODUTOS });
    if (modo === 'firebase' && fs) {
      await substituirTudoNoServidor(padrao);
    }
    estado = padrao;
    gravarCache();
    avisar();
  }

  /** Apaga o que está no servidor e grava o conjunto novo, em lotes de 400
      (o Firestore aceita no máximo 500 operações por lote). */
  async function substituirTudoNoServidor(novo) {
    const [cats, prods] = await Promise.all([
      fs.collection(COL_CATEGORIAS).get(),
      fs.collection(COL_PRODUTOS).get()
    ]);

    const operacoes = [];
    cats.docs.forEach(d => operacoes.push(l => l.delete(d.ref)));
    prods.docs.forEach(d => operacoes.push(l => l.delete(d.ref)));
    novo.categorias.forEach(c => {
      const { slug, ...r } = c;
      operacoes.push(l => l.set(fs.collection(COL_CATEGORIAS).doc(slug), r));
    });
    novo.produtos.forEach(p => {
      const { id, ...r } = p;
      operacoes.push(l => l.set(fs.collection(COL_PRODUTOS).doc(id), r));
    });

    for (let i = 0; i < operacoes.length; i += 400) {
      const lote = fs.batch();
      operacoes.slice(i, i + 400).forEach(op => op(lote));
      await lote.commit();
    }
  }

  /* ===================================================================
     NOTIFICAÇÃO
  =================================================================== */
  function aoMudar(fn) { if (typeof fn === 'function') ouvintes.push(fn); }
  function avisar() { ouvintes.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } }); }

  return {
    iniciar, aoMudar,
    get modo() { return modo; },

    // leitura
    categorias, produtos, todasCategorias, todosProdutos,
    categoriaPorSlug, produtoPorId, contarProdutos, produtosNaCategoria,

    // escrita
    salvarCategoria, excluirCategoria,
    salvarProduto, excluirProduto, duplicarProduto, alternarAtivo,

    // apoio
    precoFinal, precoRiscado, emPromocao, gerarSlug, gerarId,
    comprimirImagem, pesoImagemKB, nomeDuplicado,

    // backup
    exportar, importar, restaurarPadrao,

    // conexão com o servidor
    testarConexao, salvarConfigLocal, limparConfigLocal, configFirebase, configNoArquivo,
    get conectado() { return modo === 'firebase'; }
  };
})();
