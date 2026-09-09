/* =============================================================================
   SF PARFUMS — CATÁLOGO DE PRODUTOS
   -----------------------------------------------------------------------------
   Este é o ÚNICO arquivo que precisa ser editado para alterar a loja.
   Todo o resto do site (carrinho, busca, filtros, checkout, WhatsApp) lê daqui.

   ⚠️  ATENÇÃO — CATÁLOGO EM MODO DEMONSTRAÇÃO
   Os produtos abaixo são EXEMPLOS de estrutura, com nomes e preços fictícios.
   Substitua-os pelos produtos reais da SF PARFUMS antes de publicar a loja.
   Enquanto `modoDemonstracao` for `true`, um aviso aparece no topo do site.
   Ao inserir os produtos reais, mude para `false`.

   Como cadastrar um produto:
   {
     id:        'ar-001',              // identificador único (não repetir)
     nome:      'Nome do Perfume',     // aparece no card, no modal e no WhatsApp
     categoria: 'arabes',              // arabes | brand-collection | importados | victorias-secret
     preco:     149.90,                // número, sempre com ponto decimal
     precoAntigo: null,                // opcional: preço "de" riscado. Use null se não houver
     volume:    '100ml',               // opcional: '' se não houver
     descricao: 'Texto descritivo...', // opcional: '' se não houver
     imagem:    '',                    // URL da foto. Vazio = placeholder elegante da marca
     destaque:  false,                 // true = aparece na vitrine "Destaques" da home
     estoque:   true                   // false = card marcado como esgotado
   }

   Dica: use a página `admin.html` para colar sua lista de produtos e gerar
   automaticamente o conteúdo deste arquivo, sem precisar escrever código.
============================================================================= */

const CATEGORIAS = [
  {
    slug: 'arabes',
    nome: 'Árabes',
    chamada: 'Fixação intensa e rastro marcante',
    descricao: 'Perfumes de inspiração oriental, com alta concentração, projeção poderosa e horas de fixação. Para quem quer ser lembrado.',
    icone: '🕌'
  },
  {
    slug: 'brand-collection',
    nome: 'Brand Collection',
    chamada: 'Inspirações dos grandes clássicos',
    descricao: 'Fragrâncias inspiradas nos perfumes mais desejados do mundo, com excelente custo-benefício e qualidade comprovada.',
    icone: '🎯'
  },
  {
    slug: 'importados',
    nome: 'Importados',
    chamada: 'Originais das melhores maisons',
    descricao: 'Perfumes importados originais, lacrados e selecionados. A sofisticação das grandes marcas internacionais.',
    icone: '✈️'
  },
  {
    slug: 'victorias-secret',
    nome: "Victoria's Secret",
    chamada: 'Feminilidade, brilho e sedução',
    descricao: 'A linha completa Victoria’s Secret: body splash, cremes e fragrâncias que marcaram gerações.',
    icone: '💗'
  }
];

const CATALOGO = {
  /* Mude para false depois de cadastrar os produtos reais da loja. */
  modoDemonstracao: true,

  produtos: [
    /* ---------------------------------------------------------------- ÁRABES */
    { id:'ar-001', nome:'[EXEMPLO] Árabe Intenso 01', categoria:'arabes', preco:189.90, precoAntigo:229.90, volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'ar-002', nome:'[EXEMPLO] Árabe Intenso 02', categoria:'arabes', preco:179.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'ar-003', nome:'[EXEMPLO] Árabe Intenso 03', categoria:'arabes', preco:219.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'ar-004', nome:'[EXEMPLO] Árabe Intenso 04', categoria:'arabes', preco:159.90, precoAntigo:null,   volume:'50ml',  descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'ar-005', nome:'[EXEMPLO] Árabe Intenso 05', categoria:'arabes', preco:249.90, precoAntigo:299.90, volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'ar-006', nome:'[EXEMPLO] Árabe Intenso 06', categoria:'arabes', preco:139.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Árabes da SF PARFUMS.', imagem:'', destaque:false, estoque:false },

    /* ------------------------------------------------------ BRAND COLLECTION */
    { id:'bc-001', nome:'[EXEMPLO] Brand Collection 01', categoria:'brand-collection', preco:69.90, precoAntigo:89.90, volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'bc-002', nome:'[EXEMPLO] Brand Collection 02', categoria:'brand-collection', preco:69.90, precoAntigo:null,  volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'bc-003', nome:'[EXEMPLO] Brand Collection 03', categoria:'brand-collection', preco:69.90, precoAntigo:null,  volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'bc-004', nome:'[EXEMPLO] Brand Collection 04', categoria:'brand-collection', preco:79.90, precoAntigo:null,  volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'bc-005', nome:'[EXEMPLO] Brand Collection 05', categoria:'brand-collection', preco:69.90, precoAntigo:null,  volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'bc-006', nome:'[EXEMPLO] Brand Collection 06', categoria:'brand-collection', preco:69.90, precoAntigo:null,  volume:'25ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Brand Collection da SF PARFUMS.', imagem:'', destaque:false, estoque:true },

    /* ------------------------------------------------------------ IMPORTADOS */
    { id:'im-001', nome:'[EXEMPLO] Importado 01', categoria:'importados', preco:449.90, precoAntigo:529.90, volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'im-002', nome:'[EXEMPLO] Importado 02', categoria:'importados', preco:389.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'im-003', nome:'[EXEMPLO] Importado 03', categoria:'importados', preco:529.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'im-004', nome:'[EXEMPLO] Importado 04', categoria:'importados', preco:299.90, precoAntigo:null,   volume:'50ml',  descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'im-005', nome:'[EXEMPLO] Importado 05', categoria:'importados', preco:479.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'im-006', nome:'[EXEMPLO] Importado 06', categoria:'importados', preco:359.90, precoAntigo:null,   volume:'100ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Importados da SF PARFUMS.', imagem:'', destaque:false, estoque:false },

    /* ------------------------------------------------------ VICTORIA'S SECRET */
    { id:'vs-001', nome:'[EXEMPLO] Victoria’s Secret 01', categoria:'victorias-secret', preco:129.90, precoAntigo:159.90, volume:'250ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'vs-002', nome:'[EXEMPLO] Victoria’s Secret 02', categoria:'victorias-secret', preco:119.90, precoAntigo:null,   volume:'250ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'vs-003', nome:'[EXEMPLO] Victoria’s Secret 03', categoria:'victorias-secret', preco:139.90, precoAntigo:null,   volume:'250ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:true,  estoque:true },
    { id:'vs-004', nome:'[EXEMPLO] Victoria’s Secret 04', categoria:'victorias-secret', preco:99.90,  precoAntigo:null,   volume:'75ml',  descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'vs-005', nome:'[EXEMPLO] Victoria’s Secret 05', categoria:'victorias-secret', preco:149.90, precoAntigo:null,   volume:'250ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:false, estoque:true },
    { id:'vs-006', nome:'[EXEMPLO] Victoria’s Secret 06', categoria:'victorias-secret', preco:109.90, precoAntigo:null,   volume:'250ml', descricao:'Produto de demonstração. Substitua pelos dados reais do catálogo Victoria’s Secret da SF PARFUMS.', imagem:'', destaque:false, estoque:true }
  ]
};

/* =============================================================================
   CONFIGURAÇÃO DA LOJA
============================================================================= */
const LOJA = {
  nome: 'SF PARFUMS',
  instagram: 'https://www.instagram.com/sf_parfums',
  instagramHandle: '@sf_parfums',

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
  ]
};
