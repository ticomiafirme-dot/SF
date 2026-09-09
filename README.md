# SF PARFUMS — E-commerce

Loja online da **SF PARFUMS**, com catálogo dividido em quatro categorias, carrinho persistente
e finalização de pedido direto no WhatsApp do vendedor escolhido pelo cliente.

Construída em **HTML5, CSS3 e JavaScript**, com **Bootstrap 5.3** como base de grid,
utilitários e componentes responsivos (offcanvas e modais). Não há build, framework de
front-end nem back-end: é só abrir o `index.html`.

---

## ⚠️ Catálogo: ação necessária

O arquivo `js/produtos.js` está com um **catálogo de demonstração** (produtos marcados
com `[EXEMPLO]` e preços fictícios). Enquanto ele estiver assim, uma faixa de aviso
aparece no topo do site.

**Os quatro sites de referência não puderam ser lidos**: os domínios `*.figma.site`
são bloqueados pela política de rede do ambiente onde este projeto foi construído
(HTTP 403 no proxy de saída). Nenhum produto, preço ou imagem foi inventado.

Para colocar o catálogo real no ar, abra `js/produtos.js` e preencha a lista
`CATALOGO.produtos` seguindo o modelo comentado no topo do arquivo. Depois de
cadastrar os produtos reais, mude `modoDemonstracao: true` para `false` — isso
remove a faixa de aviso do topo do site.

---

## Estrutura

```
SF/
├── index.html              Loja (página única)
├── css/
│   └── style.css           Tema branco + dourado, modo claro/escuro, componentes
├── js/
│   ├── produtos.js         ← CATÁLOGO E CONFIGURAÇÃO (único arquivo a editar)
│   ├── loja.js             Tema, renderização, busca, filtros, modal de produto
│   ├── carrinho.js         Carrinho + persistência em localStorage
│   └── checkout.js         Checkout em 4 etapas, frete, CEP, vendedor, WhatsApp
└── vendor/bootstrap/       Bootstrap 5.3.3 (CSS + JS bundle)
```

O Bootstrap está **embutido no projeto** para o site funcionar mesmo sem internet ou
se um CDN cair. Para usar o CDN, troque as duas tags em `index.html` por:

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
```

---

## Categorias

Os produtos ficam separados por `categoria` e **nunca se misturam** entre as seções:

| slug | Categoria |
|------|-----------|
| `arabes` | Árabes |
| `brand-collection` | Brand Collection |
| `importados` | Importados |
| `victorias-secret` | Victoria's Secret |

Além das quatro, o cliente pode ver **Todos os produtos** (filtro `todos`).

---

## Funcionalidades

**Catálogo**
- Página inicial com banner, as quatro categorias e vitrine de destaques
- Busca por nome (ignora acentos e maiúsculas, aceita várias palavras)
- Filtro por categoria e ordenação por preço ou nome
- Modal de detalhes com imagem, descrição, seletor de quantidade e total ao vivo
- Selos de *Oferta* e *Esgotado*; produtos esgotados não entram no carrinho

**Carrinho**
- Adicionar, remover, aumentar e diminuir quantidade
- Preço unitário, subtotal por item e total do pedido
- Salvo em `localStorage` — sobrevive ao recarregar a página

**Checkout (4 etapas)**
1. **Seus dados** — nome completo e cidade (lista fechada + opção *Outros*)
2. **Entrega** — entrega ou retirada; endereço só é pedido na entrega, com busca de CEP
3. **Pagamento** — PIX, cartão de débito ou cartão de crédito
4. **Revisão** — conferência de tudo, com atalhos para editar cada trecho

**Regras de frete**
- Santa Fé do Sul, Três Fronteiras, Rubinéia, Santa Rita e Santa Clara → **entrega grátis**
- *Outros* → campo obrigatório de cidade + **frete a combinar com o vendedor**
  (nenhum valor é calculado ou inventado pelo site)
- Retirada → o formulário não pede endereço

**CEP**
Busca automática pela [ViaCEP](https://viacep.com.br) ao completar 8 dígitos, preenchendo
rua, bairro, cidade e estado. Se a consulta falhar, o cliente preenche manualmente e o
pedido segue normalmente.

**Vendedor e WhatsApp**
Ao confirmar, o site **não abre o WhatsApp direto**: primeiro pergunta com qual vendedor
o cliente quer falar (Brayan Frigo ou Felipe Stagliano) e só então abre a conversa do
número escolhido, com a mensagem do pedido já montada.

A mensagem usa a formatação nativa do WhatsApp (`*negrito*`) e **apenas caracteres do
plano básico do Unicode** — nenhum emoji por padrão. Isso porque alguns aparelhos e
fontes trocam emoji por um losango (`◆`), o que desmontava a mensagem. Para ligar os
emojis, mude uma linha em `js/produtos.js`:

```js
mensagemComEmojis: true
```

Os emojis do conjunto opcional foram escolhidos entre os de **codepoint único**, sem
seletor de variação (U+FE0F) nem sequências ZWJ — justamente os que mais falham.

**Outros**
- Modo claro/escuro com transição suave e preferência salva
- Logos oficiais e vetorizadas do Instagram e do WhatsApp, nas cores originais das marcas
- Botão para o Instagram [@sf_parfums](https://www.instagram.com/sf_parfums) no cabeçalho, menu e rodapé
- Crédito "Site desenvolvido pro PRAG" no rodapé
- Botão flutuante de WhatsApp e voltar ao topo
- Notificações visuais ao adicionar/remover produtos e ao validar o formulário
- Nenhum pagamento é processado no site — a forma escolhida vai apenas informada no pedido

---

## Configuração

Tudo fica no fim de `js/produtos.js`, no objeto `LOJA`:

```js
const LOJA = {
  instagram: 'https://www.instagram.com/sf_parfums',
  vendedores: [
    { id:'brayan', nome:'Brayan Frigo',     telefone:'5517997838730', exibicao:'(17) 99783-8730' },
    { id:'felipe', nome:'Felipe Stagliano', telefone:'5517996756041', exibicao:'(17) 99675-6041' }
  ],
  cidadesFreteGratis: ['Santa Fé do Sul','Três Fronteiras','Rubinéia','Santa Rita','Santa Clara']
};
```

- **Telefone**: sempre `55` + DDD + número, só dígitos.
- **Cidade com frete grátis**: basta acrescentar o nome na lista — o `select` do checkout
  e o rodapé se atualizam sozinhos.

---

## Como rodar

Abra o `index.html` no navegador. Para um servidor local:

```bash
npx serve .        # ou: python3 -m http.server 8080
```

---

## Compatibilidade

Testado em Chromium de 320px a 1920px, sem rolagem horizontal em nenhuma largura:
celular, tablet (retrato e paisagem), notebook e desktop. A navegação vira menu
lateral abaixo de 1080px, e o checkout foi desenhado para ser concluído com uma mão no celular.
