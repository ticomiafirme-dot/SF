# SF PARFUMS — E-commerce

Loja online da **SF PARFUMS**, com catálogo dividido em quatro categorias, carrinho persistente
e finalização de pedido direto no WhatsApp do vendedor escolhido pelo cliente.

Construída em **HTML5, CSS3 e JavaScript**, com **Bootstrap 5.3** como base de grid,
utilitários e componentes responsivos (offcanvas e modais). Não há build, framework de
front-end nem back-end: é só abrir o `index.html`.

---

## Painel administrativo

A loja é gerenciada por um painel próprio, sem mexer em código:

```
abra  admin.html  no navegador
usuário: admin      senha: sfparfums2024
```

**Troque a senha no primeiro acesso** (Configurações → Alterar senha).

O que dá para fazer por lá:

| Tela | Para quê |
|------|----------|
| Dashboard | Números da loja e itens que precisam de atenção |
| Perfumes | Lista completa, com Editar, Duplicar, Ocultar e Excluir |
| Estilos | Criar categorias novas (Importados Plus, Nacionais, Nicho...) |
| Adicionar perfume | Cadastro completo, com pré-visualização antes de publicar |
| Gerenciar preços | Alterar vários preços de uma vez |
| Gerenciar imagens | Trocar as fotos, uma a uma |
| Gerenciar descrições | Escrever os textos que o cliente lê |
| Configurações | Senha, cópia de segurança, armazenamento |

Nada de produto ou categoria fica fixo no HTML. Ao criar um estilo, ele aparece
sozinho nos filtros do catálogo, na página inicial, no menu do celular e no
rodapé. Ao publicar um perfume, ele entra na categoria certa na mesma hora.

O menu do topo é enxuto de propósito — apenas **Início** e **Catálogo** — para o
cabeçalho não crescer a cada estilo novo. A navegação por estilo acontece nos
filtros do catálogo e no menu do celular.

Tudo que o painel salva vai para o servidor e aparece em **qualquer aparelho** —
veja *Onde os dados ficam guardados*.

O catálogo que vem de fábrica é de **demonstração** (itens marcados `[EXEMPLO]`),
com uma faixa de aviso no topo do site que desaparece assim que você cadastra
produtos reais. Os quatro sites de referência originais não puderam ser lidos:
os domínios `*.figma.site` são bloqueados pela política de rede do ambiente onde
este projeto foi construído. Nenhum produto, preço ou imagem foi inventado.

### Fotos

As imagens são escolhidas direto do computador ou do celular, com prévia antes
de salvar. Cada foto é redimensionada para no máximo 900px e comprimida em JPEG
no próprio navegador — sem isso, uma foto de celular de 5MB estouraria tanto o
limite do navegador quanto o de 1MB por documento do Firestore. Também é possível
usar o endereço de uma imagem da internet.

---

## Onde os dados ficam guardados

O catálogo **não fica no navegador**. Ele fica no Firestore (banco do Firebase),
e é de lá que a loja lê. É isso que faz um produto cadastrado no computador
aparecer no celular de qualquer cliente.

```
Painel administrativo  →  Firestore  →  Loja pública (qualquer aparelho)
```

Três garantias no código:

- **O servidor é a fonte de verdade.** Uma alteração só aparece na tela depois
  que o Firestore confirmou a gravação. Se a gravação falhar, o painel mostra o
  erro em vez de dizer "salvo com sucesso".
- **O `localStorage` é apenas cache de tela.** Serve para a loja abrir instantânea
  com o último catálogo conhecido, e é sempre substituído pelo que vem do
  servidor. Ele nunca é a origem dos dados quando há conexão.
- **A loja pública nunca grava.** Só o painel pode criar a carga inicial do banco;
  sem isso, qualquer visitante estaria escrevendo no banco da loja.

As alterações chegam por escuta em tempo real: publicar um produto no painel faz
ele aparecer nas lojas abertas **sem recarregar a página**.

---

## Conectar ao servidor

Não é preciso editar código. Entre no painel e ele mesmo conduz:

1. Painel → aparece a tela **Conecte a loja ao servidor** (ou Configurações →
   *Configurar servidor*)
2. Siga os 5 passos na tela para criar o projeto gratuito no Firebase
3. O botão **Ver as regras** entrega as regras do Firestore prontas para copiar
4. Cole a configuração que o Firebase mostrou e clique em **Testar e conectar**

O painel testa a conexão de verdade — faz uma leitura e uma gravação — e só
confirma se as duas funcionarem. Se as regras estiverem bloqueando, ele diz isso
com todas as letras em vez de falhar em silêncio.

### O passo que falta para valer em todos os aparelhos

Ao conectar, a configuração fica salva **naquele navegador**, para você testar na
hora. Para que todos os aparelhos usem o mesmo banco, ela precisa estar no arquivo
do site: o painel entrega o bloco `FIREBASE_CONFIG` pronto, com botão de copiar.
Cole em `js/produtos.js`, publique o site de novo e pronto.

Enquanto isso não for feito, o painel mostra um aviso permanente em faixa laranja:
**MODO DE TESTE — os clientes não veem nada disto.** É possível seguir sem
conectar para experimentar, mas o aviso não sai da tela.

### Regras do Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /categorias/{doc} { allow read: if true; allow write: if true; }
    match /produtos/{doc}   { allow read: if true; allow write: if true; }
    match /_teste_conexao/{doc} { allow read, write: if true; }
  }
}
```

⚠️ Estas regras deixam **qualquer pessoa gravar** no banco. Elas funcionam de
imediato e são adequadas para começar, mas quem descobrir o endereço do projeto
pode alterar o catálogo. Para fechar isso, ative **Authentication → Anônimo** no
Firebase e troque `allow write: if true` por uma verificação do UID do
administrador. Isso exige integrar o Firebase Authentication ao painel, que hoje
usa login local — veja Segurança.

---

## Hospedar o site na internet

O site é estático (HTML, CSS e JS), então **a hospedagem é gratuita** em qualquer
um destes serviços: Netlify, Vercel, Cloudflare Pages ou GitHub Pages. Basta
enviar a pasta do projeto. O único custo opcional é o domínio próprio
(um `.com.br` sai por volta de R$ 40 por ano).

### O que acontece com os dados já cadastrados

| Situação | O que acontece |
|----------|----------------|
| Visitante novo, primeira vez | Carrega `data/catalogo.json`, o catálogo que veio no projeto |
| Administrador que já cadastrou no navegador | Ao configurar o Firebase, **esse trabalho sobe automaticamente** na primeira conexão — o catálogo de exemplo não sobrescreve nada |
| Precisa levar os dados para outro computador | Configurações → *Baixar cópia de segurança*, e no outro aparelho *Restaurar de um arquivo* |

### Custo de cadastrar e editar produtos

Com o Firebase configurado, o plano gratuito (Spark) cobre folgadamente uma loja
deste porte. Os limites relevantes são: **1 GiB** de dados guardados,
**50 mil leituras** e **20 mil gravações** por dia, e **10 GiB de tráfego por mês**.

Cadastrar ou editar um produto custa **1 gravação**. Mesmo mexendo no catálogo o
dia inteiro, é impossível chegar perto de 20 mil.

O ponto que merece atenção é outro: **as fotos são guardadas dentro do próprio
registro do produto**, e o tráfego mensal é o limite que aperta primeiro. Cada
visitante novo baixa o catálogo uma vez (depois fica em cache no navegador dele):

| Tamanho do catálogo | Espaço usado | Por visitante novo | Cabe no plano gratuito |
|---------------------|--------------|--------------------|------------------------|
| 50 produtos | ~6 MB | ~6 MB | ~1.700 visitas/mês |
| 100 produtos | ~12 MB | ~12 MB | ~850 visitas/mês |
| 200 produtos | ~24 MB | ~24 MB | ~425 visitas/mês |

Para uma loja de bairro começando, isso é confortável. Passar do limite não
derruba nada: no plano Blaze o excedente é cobrado por uso e sai por poucos reais
por mês. Ainda assim, se o catálogo passar de ~100 produtos ou o movimento
crescer, o certo é **guardar as fotos no Firebase Storage** (também gratuito até
5 GB) e deixar no Firestore apenas o endereço da imagem. Aí cada registro cai
para cerca de 1 KB, o tráfego vira praticamente nada e as fotos passam a ser
servidas por CDN, carregando mais rápido. Essa mudança mexe só em `js/dados.js`.

### Sem o Firebase

Se você publicar o site sem configurar o Firebase, ele funciona normalmente para
os clientes — mas com o catálogo de `data/catalogo.json`. O que o administrador
cadastrar pelo painel fica **só no navegador dele**, e os clientes não veem. O
painel avisa isso na barra lateral e em Configurações.

---

## Segurança

O login do painel compara o **hash SHA-256** da senha; a senha em texto não fica
guardada em lugar nenhum. A sessão expira em 2 horas.

⚠️ **Limite importante e intencionalmente explícito:** esta verificação roda no
navegador. Ela impede o acesso casual de um visitante, mas **não resiste a alguém
que saiba ler o código-fonte da página**. Proteção de verdade exige validação em
servidor — no caminho do Firebase, isso significa usar o Firebase Authentication
e travar a escrita por UID nas regras do Firestore.

Ao trocar a senha pelo painel, a nova senha vale naquele aparelho. Para valer em
todos, o painel entrega o novo `senhaHash` pronto para colar em `js/produtos.js`.

---

## Estrutura

```
SF/
├── index.html              Loja pública
├── admin.html              Painel administrativo
├── css/
│   ├── style.css           Tema branco + dourado, modo claro/escuro, componentes
│   └── admin.css           Estilos do painel (reaproveita os tokens da loja)
├── js/
│   ├── produtos.js         Configuração da loja + catálogo inicial
│   ├── dados.js            Camada de dados: localStorage / Firebase, imagens, migração
│   ├── loja.js             Renderização da loja, busca, filtros, modal de produto
│   ├── carrinho.js         Carrinho + persistência
│   ├── checkout.js         Checkout em 4 etapas, frete, CEP, vendedor, WhatsApp
│   └── admin.js            Painel: login, CRUD, edição rápida, backup
├── data/
│   └── catalogo.json       Catálogo publicado (carga inicial da loja)
└── vendor/bootstrap/       Bootstrap 5.3.3 (CSS + JS bundle)
```

A camada `js/dados.js` é a **única fonte** de produtos e categorias, lida tanto
pela loja quanto pelo painel. Trocar o armazenamento (Firebase, outro servidor)
mexe só nesse arquivo.

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

Além dessas, o cliente pode ver **Todos os produtos** (filtro `todos`).

Estas quatro são apenas o ponto de partida: **o administrador cria quantos estilos
quiser** pelo painel, e eles entram na loja sozinhos.

---

## Funcionalidades

**Catálogo**
- Página inicial com banner, as categorias cadastradas e vitrine de destaques
- Busca por nome (ignora acentos e maiúsculas, aceita várias palavras)
- Filtro por categoria e ordenação por preço ou nome
- Modal de detalhes com galeria de fotos, ficha técnica (volume, gênero, notas),
  descrição, seletor de quantidade e total ao vivo
- Selos de *Oferta* e *Esgotado*; produtos esgotados não entram no carrinho
- Preço promocional: o valor normal aparece riscado e o cliente paga o promocional

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
