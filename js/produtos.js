/* =============================================================================
   SF PARFUMS — produtos.js
   CONFIGURAÇÃO DA LOJA + CATÁLOGO INICIAL

   ⚠️  Você NÃO precisa mais editar este arquivo para mexer no catálogo.
   Produtos e estilos são cadastrados pelo painel administrativo:

       abra  admin.html  no navegador

   O que está aqui embaixo é apenas o catálogo INICIAL — usado uma única vez,
   na primeira abertura da loja, quando ainda não existe nada cadastrado.
   Depois disso, tudo passa a vir do painel.
============================================================================= */

/* =============================================================================
   1. FIREBASE — publicação automática para todos os clientes
   -----------------------------------------------------------------------------
   Enquanto isto estiver vazio, o painel salva apenas no navegador de quem
   administra (útil para testar, mas os clientes não veem as mudanças).

   Ao preencher, tudo que o administrador publicar aparece na hora para todos
   os clientes, de qualquer aparelho — sem enviar arquivo nenhum.

   Como obter estes dados (leva ~5 minutos, é gratuito):
     1. Acesse console.firebase.google.com e clique em "Adicionar projeto".
     2. Dentro do projeto, vá em "Firestore Database" → "Criar banco de dados"
        → escolha "Iniciar no modo de produção" → selecione a região.
     3. Em "Regras", cole as regras que estão no README (seção Firebase).
     4. Clique na engrenagem → "Configurações do projeto" → role até
        "Seus aplicativos" → ícone da web (</>) → registre o app.
     5. Copie os valores do objeto firebaseConfig que aparece e cole abaixo.
============================================================================= */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCc2kWtxSNImWafgUaVFWfmJqTLKJIzZuM',
  authDomain:        'sf-parfums.firebaseapp.com',
  projectId:         'sf-parfums',
  storageBucket:     'sf-parfums.firebasestorage.app',
  messagingSenderId: '131308581632',
  appId:             '1:131308581632:web:f343e1ff7f1db5d1e4f9e5'
};

/* =============================================================================
   2. DADOS DA LOJA
============================================================================= */
const LOJA = {
  nome: 'SF PARFUMS',
  instagram: 'https://www.instagram.com/sf_parfums',
  instagramHandle: '@sf_parfums',

  /* Emojis na mensagem enviada ao WhatsApp.
     Deixe false para uma mensagem que aparece igual em qualquer aparelho —
     alguns celulares e fontes trocam emoji por um losango (◆).
     Mude para true se no seu WhatsApp os emojis aparecerem corretamente. */
  mensagemComEmojis: false,

  /* Vendedores — o cliente escolhe um antes de abrir o WhatsApp. */
  vendedores: [
    { id:'brayan', nome:'Brayan Frigo',     telefone:'5517997838730', exibicao:'(17) 99783-8730' },
    { id:'felipe', nome:'Felipe Stagliano', telefone:'5517996756041', exibicao:'(17) 99675-6041' }
  ],

  /* Cidades com ENTREGA GRATUITA. Para adicionar outra, basta incluir aqui. */
  cidadesFreteGratis: [
    'Santa Fé do Sul',
    'Três Fronteiras',
    'Rubinéia',
    'Santa Rita',
    'Santa Clara'
  ],

  /* ---------------------------------------------------------------------------
     ACESSO AO PAINEL ADMINISTRATIVO
     A senha não fica guardada aqui: guardamos apenas o hash SHA-256 dela.
     Para trocar a senha, entre no painel → Configurações → Alterar senha.

     ⚠️  LIMITE IMPORTANTE: esta trava roda no navegador, então protege contra
     acesso casual, mas não contra alguém que saiba ler o código-fonte da
     página. Proteção de verdade exige validação em servidor — veja o README.
  --------------------------------------------------------------------------- */
  admin: {
    usuario: 'admin',
    /* Hash SHA-256 da senha. A senha em texto não fica em lugar nenhum:
       este arquivo é baixado pelo navegador e qualquer visitante pode lê-lo. */
    senhaHash: 'ad151b55b43eb168d93fcb2dce8c1dffe44c20f4b3fd5b222dd2238af895553b',
    minutosSessao: 120
  }
};

/* =============================================================================
   3. CATÁLOGO INICIAL
   Usado só na primeira abertura. Depois, o painel manda.

   ⚠️  CATÁLOGO DE DEMONSTRAÇÃO
   Os itens abaixo são exemplos, com nomes e preços fictícios. Cadastre os
   produtos reais pelo painel (admin.html) e apague estes exemplos por lá.
============================================================================= */
const SEED_CATEGORIAS = [
  { slug:'arabes',            nome:'Árabes',             icone:'🕌', ativo:true, ordem:0,
    chamada:'Fixação intensa e rastro marcante',
    descricao:'Perfumes de inspiração oriental, com alta concentração, projeção poderosa e horas de fixação. Para quem quer ser lembrado.' },
  { slug:'brand-collection',  nome:'Brand Collection',   icone:'🎯', ativo:true, ordem:1,
    chamada:'Inspirações dos grandes clássicos',
    descricao:'Fragrâncias inspiradas nos perfumes mais desejados do mundo, com excelente custo-benefício e qualidade comprovada.' },
  { slug:'importados',        nome:'Importados',         icone:'✈️', ativo:true, ordem:2,
    chamada:'Originais das melhores maisons',
    descricao:'Perfumes importados originais, lacrados e selecionados. A sofisticação das grandes marcas internacionais.' },
  { slug:'victorias-secret',  nome:"Victoria's Secret",  icone:'💗', ativo:true, ordem:3,
    chamada:'Feminilidade, brilho e sedução',
    descricao:'A linha completa Victoria’s Secret: body splash, cremes e fragrâncias que marcaram gerações.' }
];

const SEED_PRODUTOS = [
  /* ------------------------------------------------------------------ ÁRABES */
  { id:'ar-001', nome:'[EXEMPLO] Árabe Intenso 01', categoria:'arabes', preco:229.90, precoPromocional:189.90, volume:'100ml', destaque:true,  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'ar-002', nome:'[EXEMPLO] Árabe Intenso 02', categoria:'arabes', preco:179.90, volume:'100ml', estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'ar-003', nome:'[EXEMPLO] Árabe Intenso 03', categoria:'arabes', preco:219.90, volume:'100ml', destaque:true,  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'ar-004', nome:'[EXEMPLO] Árabe Intenso 04', categoria:'arabes', preco:159.90, volume:'50ml',  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'ar-005', nome:'[EXEMPLO] Árabe Intenso 05', categoria:'arabes', preco:299.90, precoPromocional:249.90, volume:'100ml', estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'ar-006', nome:'[EXEMPLO] Árabe Intenso 06', categoria:'arabes', preco:139.90, volume:'100ml', estoque:false, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },

  /* -------------------------------------------------------- BRAND COLLECTION */
  { id:'bc-001', nome:'[EXEMPLO] Brand Collection 01', categoria:'brand-collection', preco:89.90, precoPromocional:69.90, volume:'25ml', destaque:true,  estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'bc-002', nome:'[EXEMPLO] Brand Collection 02', categoria:'brand-collection', preco:69.90, volume:'25ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'bc-003', nome:'[EXEMPLO] Brand Collection 03', categoria:'brand-collection', preco:69.90, volume:'25ml', destaque:true,  estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'bc-004', nome:'[EXEMPLO] Brand Collection 04', categoria:'brand-collection', preco:79.90, volume:'25ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'bc-005', nome:'[EXEMPLO] Brand Collection 05', categoria:'brand-collection', preco:69.90, volume:'25ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'bc-006', nome:'[EXEMPLO] Brand Collection 06', categoria:'brand-collection', preco:69.90, volume:'25ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },

  /* -------------------------------------------------------------- IMPORTADOS */
  { id:'im-001', nome:'[EXEMPLO] Importado 01', categoria:'importados', preco:529.90, precoPromocional:449.90, volume:'100ml', destaque:true,  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'im-002', nome:'[EXEMPLO] Importado 02', categoria:'importados', preco:389.90, volume:'100ml', estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'im-003', nome:'[EXEMPLO] Importado 03', categoria:'importados', preco:529.90, volume:'100ml', destaque:true,  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'im-004', nome:'[EXEMPLO] Importado 04', categoria:'importados', preco:299.90, volume:'50ml',  estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'im-005', nome:'[EXEMPLO] Importado 05', categoria:'importados', preco:479.90, volume:'100ml', estoque:true,  descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'im-006', nome:'[EXEMPLO] Importado 06', categoria:'importados', preco:359.90, volume:'100ml', estoque:false, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },

  /* -------------------------------------------------------- VICTORIA'S SECRET */
  { id:'vs-001', nome:'[EXEMPLO] Victoria’s Secret 01', categoria:'victorias-secret', preco:159.90, precoPromocional:129.90, volume:'250ml', destaque:true,  estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'vs-002', nome:'[EXEMPLO] Victoria’s Secret 02', categoria:'victorias-secret', preco:119.90, volume:'250ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'vs-003', nome:'[EXEMPLO] Victoria’s Secret 03', categoria:'victorias-secret', preco:139.90, volume:'250ml', destaque:true,  estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'vs-004', nome:'[EXEMPLO] Victoria’s Secret 04', categoria:'victorias-secret', preco:99.90,  volume:'75ml',  estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'vs-005', nome:'[EXEMPLO] Victoria’s Secret 05', categoria:'victorias-secret', preco:149.90, volume:'250ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' },
  { id:'vs-006', nome:'[EXEMPLO] Victoria’s Secret 06', categoria:'victorias-secret', preco:109.90, volume:'250ml', estoque:true, descricao:'Produto de demonstração. Cadastre os produtos reais pelo painel administrativo.' }
];

/* Marca o catálogo de exemplo. O painel desliga isso ao salvar dados reais. */
const CATALOGO_DEMO = true;
