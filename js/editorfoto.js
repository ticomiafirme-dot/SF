/* =============================================================================
   SF PARFUMS — editorfoto.js
   Editor de enquadramento das fotos, no mesmo espírito de escolher a foto de
   perfil de uma rede social: a foto aparece dentro do quadro do card, o
   administrador arrasta e aproxima até gostar, e só então confirma.

   O que ele confirma NÃO é um recorte do arquivo. A imagem original continua
   inteira e o que fica guardado são as medidas do enquadramento — assim dá
   para reabrir e reajustar depois sem enviar a foto de novo, e a loja monta a
   mesma cena a partir desses números (DB.estiloEnquadramento).

   Uso:
     const r = await EditorFoto.abrir({ src, enquadramento, proporcao });
     // r === null  → o administrador cancelou
     // r === { src, enquadramento }
============================================================================= */
'use strict';

const EditorFoto = (() => {
  const q = s => document.querySelector(s);
  const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

  let modal = null;          // instância do Bootstrap
  let el = null;             // elementos do modal, achados uma vez só
  let resolver = null;       // promessa do abrir() em andamento
  let pendente = null;       // enquadramento a restaurar na primeira medição
  let imgPronta = false;
  let modalPronto = false;
  let fundoErguido = null;   // fundo escuro que subimos para cima do cadastro
  let resultado = null;      // preenchido ao confirmar, entregue ao fechar
  let fechando = false;      // o modal está no meio da animação de saída

  /* Tudo em pixels de tela, menos W/H (tamanho real do arquivo). */
  const st = {
    src: '', W: 0, H: 0,
    proporcao: 1,                       // largura ÷ altura do quadro
    quadroX: 0, quadroY: 0, quadroW: 0, quadroH: 0,
    base: 1,                            // escala em que a foto preenche o quadro
    escala: 1,                          // multiplicador escolhido (1 = preenchendo)
    dx: 0, dy: 0                        // deslocamento a partir do centro
  };

  const zoomMax = () => (window.DB?.ZOOM_MAXIMO) || 4;

  /* ======================================================== GEOMETRIA */

  /** Canto superior esquerdo da foto dentro do palco. */
  const bordaX = (escala = st.escala) =>
    st.quadroX + st.quadroW / 2 - (st.W * st.base * escala) / 2 + st.dx;
  const bordaY = (escala = st.escala) =>
    st.quadroY + st.quadroH / 2 - (st.H * st.base * escala) / 2 + st.dy;

  /** A foto nunca deixa sobrar buraco no quadro: o arrasto para na borda. */
  function prenderNoQuadro() {
    const folgaX = Math.max(0, (st.W * st.base * st.escala - st.quadroW) / 2);
    const folgaY = Math.max(0, (st.H * st.base * st.escala - st.quadroH) / 2);
    st.dx = limitar(st.dx, -folgaX, folgaX);
    st.dy = limitar(st.dy, -folgaY, folgaY);
  }

  /** Mede o palco e recalcula o quadro. `manter` remonta um enquadramento. */
  function medir(manter) {
    const r = el.palco.getBoundingClientRect();
    if (!r.width || !r.height || !st.W) return false;

    /* Sobra de propósito ao redor do quadro: é nela que aparece, escurecido,
       o pedaço da foto que está ficando de fora — sem isso o administrador
       arrasta às cegas. */
    const margem = Math.min(30, Math.min(r.width, r.height) * 0.085);
    const largMax = Math.max(60, r.width - margem * 2);
    const altMax = Math.max(60, r.height - margem * 2);
    st.quadroH = Math.min(altMax, largMax / st.proporcao);
    st.quadroW = st.quadroH * st.proporcao;
    st.quadroX = (r.width - st.quadroW) / 2;
    st.quadroY = (r.height - st.quadroH) / 2;
    st.base = Math.max(st.quadroW / st.W, st.quadroH / st.H);

    if (manter) restaurar(manter);
    else prenderNoQuadro();
    return true;
  }

  /** Estado interno a partir de um enquadramento salvo. */
  function restaurar(enq) {
    const e = DB.normalizarEnquadramento(enq);
    if (!e) { st.escala = 1; st.dx = 0; st.dy = 0; prenderNoQuadro(); return; }
    st.escala = limitar(st.quadroW / (st.base * e.largura * st.W), 1, zoomMax());
    const total = st.base * st.escala;
    st.dx = (0.5 - e.x) * total * st.W;
    st.dy = (0.5 - e.y) * total * st.H;
    prenderNoQuadro();
  }

  /** Enquadramento salvo a partir do estado interno. */
  function enquadramentoAtual() {
    const total = st.base * st.escala;
    return DB.normalizarEnquadramento({
      x: 0.5 - st.dx / (total * st.W),
      y: 0.5 - st.dy / (total * st.H),
      largura: st.quadroW / (total * st.W),
      altura: st.quadroH / (total * st.H),
      zoom: st.escala,
      proporcao: st.proporcao
    });
  }

  /** Muda o zoom mantendo parado o ponto da foto que está sob (px, py). */
  function aplicarZoom(nova, px, py) {
    nova = limitar(nova, 1, zoomMax());
    if (Math.abs(nova - st.escala) < 0.0005) return;

    if (px == null) { px = st.quadroX + st.quadroW / 2; py = st.quadroY + st.quadroH / 2; }
    const totalAntes = st.base * st.escala;
    const fx = (px - bordaX()) / totalAntes;      // ponto da foto sob o cursor
    const fy = (py - bordaY()) / totalAntes;

    st.escala = nova;
    const total = st.base * nova;
    // recoloca esse mesmo ponto sob o cursor
    st.dx = (px - fx * total) - (st.quadroX + st.quadroW / 2 - (st.W * total) / 2);
    st.dy = (py - fy * total) - (st.quadroY + st.quadroH / 2 - (st.H * total) / 2);
    prenderNoQuadro();
    desenhar();
  }

  /* ========================================================== DESENHO */
  function desenhar() {
    if (!st.W || !st.quadroW) return;
    const larg = st.W * st.base * st.escala;
    const alt = st.H * st.base * st.escala;

    el.foto.style.width = `${larg}px`;
    el.foto.style.height = `${alt}px`;
    el.foto.style.left = `${bordaX()}px`;
    el.foto.style.top = `${bordaY()}px`;

    el.quadro.style.width = `${st.quadroW}px`;
    el.quadro.style.height = `${st.quadroH}px`;
    el.quadro.style.left = `${st.quadroX}px`;
    el.quadro.style.top = `${st.quadroY}px`;

    const pct = Math.round(st.escala * 100);
    el.valor.textContent = `${pct}%`;
    el.range.value = pct;

    // A prévia usa o MESMO renderizador da loja: o que aparece aqui é
    // literalmente o que o cliente vai ver, não uma imitação.
    el.previaImg.style.cssText = DB.estiloEnquadramento(enquadramentoAtual());

    /* Passar muito do tamanho original deixa a foto borrada só na loja, onde
       já é tarde para perceber. O corte é em 300 pixels do arquivo original:
       abaixo disso o card começa a esticar a imagem de verdade. Mais alto que
       isso o aviso apareceria quase sempre e viraria paisagem. */
    const pxOriginais = st.quadroW / (st.base * st.escala);
    el.aviso.hidden = pxOriginais >= 300;
  }

  /* ========================================================== EVENTOS */
  const ponteiros = new Map();
  let pinca = null;

  function pontoLocal(ev) {
    const r = el.palco.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const meio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const capturar = id => { try { el.palco.setPointerCapture(id); } catch (e) { /* sem captura */ } };
  const soltar = id => { try { el.palco.releasePointerCapture(id); } catch (e) { /* já solto */ } };

  function aoPressionar(ev) {
    if (!st.W) return;
    capturar(ev.pointerId);
    ponteiros.set(ev.pointerId, pontoLocal(ev));
    el.palco.classList.add('arrastando');
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      pinca = { dist: distancia(a, b), escala: st.escala };
    }
  }

  function aoMover(ev) {
    if (!ponteiros.has(ev.pointerId)) return;
    ev.preventDefault();
    const antes = ponteiros.get(ev.pointerId);
    const agora = pontoLocal(ev);
    ponteiros.set(ev.pointerId, agora);

    if (ponteiros.size >= 2 && pinca) {
      const [a, b] = [...ponteiros.values()];
      const nova = distancia(a, b);
      if (pinca.dist > 8) {
        const c = meio(a, b);
        aplicarZoom(pinca.escala * (nova / pinca.dist), c.x, c.y);
      }
      return;
    }

    st.dx += agora.x - antes.x;
    st.dy += agora.y - antes.y;
    prenderNoQuadro();
    desenhar();
  }

  function aoSoltar(ev) {
    ponteiros.delete(ev.pointerId);
    soltar(ev.pointerId);
    if (ponteiros.size < 2) pinca = null;
    if (ponteiros.size === 0) el.palco.classList.remove('arrastando');
  }

  function aoRolar(ev) {
    if (!st.W) return;
    ev.preventDefault();
    const p = pontoLocal(ev);
    const passo = ev.deltaY > 0 ? 0.9 : 1.1;
    aplicarZoom(st.escala * passo, p.x, p.y);
  }

  function aoTeclar(ev) {
    const passo = ev.shiftKey ? 24 : 8;
    const mapa = {
      ArrowLeft:  [passo, 0], ArrowRight: [-passo, 0],
      ArrowUp:    [0, passo], ArrowDown:  [0, -passo]
    };
    if (mapa[ev.key]) {
      ev.preventDefault();
      st.dx += mapa[ev.key][0];
      st.dy += mapa[ev.key][1];
      prenderNoQuadro();
      desenhar();
    } else if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault(); aplicarZoom(st.escala + 0.15);
    } else if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault(); aplicarZoom(st.escala - 0.15);
    }
  }

  /* ====================================================== CICLO DE VIDA */
  function montar() {
    if (el) return true;
    const caixa = q('#modalEditorFoto');
    if (!caixa || typeof bootstrap === 'undefined') return false;

    el = {
      caixa,
      titulo:    q('#tituloEditorFoto'),
      palco:     q('#editorPalco'),
      foto:      q('#editorFoto'),
      quadro:    q('#editorQuadro'),
      previa:    q('#editorPrevia'),
      previaImg: q('#editorPreviaImg'),
      range:     q('#editorRange'),
      valor:     q('#editorValor'),
      aviso:     q('#editorAviso'),
      falha:     q('#editorFalha'),
      carregando: q('#editorCarregando')
    };
    modal = new bootstrap.Modal(caixa);

    el.range.max = String(Math.round(zoomMax() * 100));

    el.palco.addEventListener('pointerdown', aoPressionar);
    el.palco.addEventListener('pointermove', aoMover);
    el.palco.addEventListener('pointerup', aoSoltar);
    el.palco.addEventListener('pointercancel', aoSoltar);
    el.palco.addEventListener('wheel', aoRolar, { passive: false });
    el.palco.addEventListener('keydown', aoTeclar);
    el.palco.addEventListener('dragstart', ev => ev.preventDefault());

    el.range.addEventListener('input', () => aplicarZoom(Number(el.range.value) / 100));
    q('#editorMais').addEventListener('click', () => aplicarZoom(st.escala + 0.2));
    q('#editorMenos').addEventListener('click', () => aplicarZoom(st.escala - 0.2));
    q('#editorCentralizar').addEventListener('click', () => {
      st.dx = 0; st.dy = 0; prenderNoQuadro(); desenhar();
    });
    q('#editorRedefinir').addEventListener('click', () => {
      st.escala = 1; st.dx = 0; st.dy = 0; prenderNoQuadro(); desenhar();
    });
    /* A promessa é resolvida SÓ no 'hidden', nunca aqui. Assim quem chamou o
       editor só volta a rodar com o modal de fato fechado — e uma abertura
       seguida (a fila de fotos adicionais, por exemplo) não é cancelada pelo
       evento de fechamento da anterior, que ainda estava a caminho. */
    q('#editorConfirmar').addEventListener('click', () => {
      if (!st.W) return;
      resultado = { src: st.src, enquadramento: enquadramentoAtual() };
      modal.hide();
    });

    /* O editor abre POR CIMA do modal de cadastro. O Bootstrap não empilha
       modais sozinho, então aqui garantimos duas coisas: o fundo escuro do
       editor fica acima do cadastro, e ao fechar o editor o cadastro não
       perde a trava de rolagem do body. */
    caixa.addEventListener('shown.bs.modal', () => {
      modalPronto = true;
      /* O Bootstrap acabou de pendurar o fundo escuro do editor no fim do
         body: é sempre o último. Guardamos a referência porque ele reaproveita
         o mesmo elemento nas próximas aberturas — marcar "o que ainda não está
         marcado" acabaria erguendo o fundo do cadastro, que não sai da tela e
         deixaria o painel travado por cima de tudo. */
      const fundos = document.querySelectorAll('.modal-backdrop');
      fundoErguido = fundos[fundos.length - 1] || null;
      fundoErguido?.classList.add('fundo-editor');
      tentarMedir();
      el.palco.focus({ preventScroll: true });
    });
    caixa.addEventListener('hide.bs.modal', () => { fechando = true; });
    // Cancelar, X, Esc e clique fora saem pelo mesmo lugar: sem resultado, é null.
    caixa.addEventListener('hidden.bs.modal', () => {
      modalPronto = false;
      fechando = false;
      ponteiros.clear(); pinca = null;
      fundoErguido = null;
      // nenhum fundo erguido sobrevive ao fechamento, aconteça o que acontecer
      document.querySelectorAll('.modal-backdrop.fundo-editor')
        .forEach(f => f.classList.remove('fundo-editor'));
      // fechar um modal apaga a trava de rolagem do body; o cadastro ainda precisa dela
      if (document.querySelector('.modal.show')) document.body.classList.add('modal-open');
      const valor = resultado;
      resultado = null;
      finalizar(valor);
    });

    window.addEventListener('resize', () => {
      if (!modalPronto || !st.W) return;
      const atual = enquadramentoAtual();
      if (medir(atual)) desenhar();
    });
    return true;
  }

  function tentarMedir() {
    if (!imgPronta || !modalPronto) return;
    if (!medir(pendente)) { requestAnimationFrame(tentarMedir); return; }
    pendente = null;
    el.carregando.hidden = true;
    desenhar();
  }

  function finalizar(valor) {
    const fn = resolver;
    resolver = null;
    if (fn) fn(valor);
  }

  /**
   * Abre o editor.
   * @param {{src:string, enquadramento?:object|null, proporcao?:number,
   *          titulo?:string}} opcoes
   * @returns {Promise<{src:string, enquadramento:object}|null>}
   */
  /** Espera a animação de saída terminar, se houver uma em curso. */
  function aguardarFechamento() {
    if (!fechando) return Promise.resolve();
    return new Promise(r => el.caixa.addEventListener('hidden.bs.modal', r, { once: true }));
  }

  async function abrir(opcoes = {}) {
    const src = String(opcoes.src || '');
    if (!src) return null;
    if (!montar()) return { src, enquadramento: null };

    await aguardarFechamento();
    finalizar(null);                       // fecha qualquer promessa pendurada
    resultado = null;
    imgPronta = false;
    st.src = src;
    st.W = 0; st.H = 0;
    st.escala = 1; st.dx = 0; st.dy = 0;
    st.proporcao = Number(opcoes.proporcao) || DB.PROPORCAO_CARD;
    pendente = DB.normalizarEnquadramento(opcoes.enquadramento);

    el.titulo.textContent = opcoes.titulo || 'Ajustar a foto';
    el.carregando.hidden = false;
    el.falha.hidden = true;
    el.aviso.hidden = true;
    q('#editorConfirmar').disabled = false;
    
    el.previa.style.aspectRatio = `${st.proporcao} / 1`;
    el.previaImg.style.cssText = '';
    el.previaImg.src = src;
    el.foto.removeAttribute('style');

    return new Promise(resolve => {
      resolver = resolve;

      /* Sem crossOrigin de propósito: nada aqui vai para o canvas, só medimos.
         Pedir CORS faria a maioria dos endereços da internet falhar à toa. */
      const foto = new Image();
      foto.onload = () => {
        st.W = foto.naturalWidth || foto.width;
        st.H = foto.naturalHeight || foto.height;
        el.foto.src = src;
        imgPronta = true;
        tentarMedir();
      };
      /* Fechar o modal no meio da animação de abertura deixa o fundo escuro
         preso na tela: aqui a falha vira um aviso e o administrador sai pelo
         Cancelar, como em qualquer outro erro do painel. */
      foto.onerror = () => {
        el.carregando.hidden = true;
        el.falha.hidden = false;
        q('#editorConfirmar').disabled = true;
        if (typeof toast === 'function') {
          toast('Não foi possível abrir esta imagem para ajustar.', 'erro', '⚠️');
        }
      };
      foto.src = src;
      modal.show();
    });
  }

  return { abrir, get disponivel() { return !!q('#modalEditorFoto'); } };
})();
