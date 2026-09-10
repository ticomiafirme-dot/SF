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
sozinho no menu do topo, no menu do celular, nos filtros, na página inicial e no
rodapé. Ao publicar um perfume, ele entra na categoria certa na mesma hora.

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

## Publicação automática (Firebase)

Enquanto o Firebase não estiver configurado, o painel salva **apenas no navegador
de quem administra**. As alterações funcionam e ficam guardadas, mas os clientes
não as veem. O painel avisa isso de forma clara em Configurações.

Para publicar para todos os clientes, de qualquer aparelho, configure o Firestore
(gratuito para este volume). Abra `js/produtos.js` e preencha `FIREBASE_CONFIG`.

**Passo a passo:**

1. Em [console.firebase.google.com](https://console.firebase.google.com), clique em
   *Adicionar projeto*.
2. No projeto, vá em **Firestore Database → Criar banco de dados**, escolha
   *Iniciar no modo de produção* e selecione a região.
3. Na aba **Regras**, cole as regras abaixo e publique.
4. Clique na engrenagem → **Configurações do projeto** → em *Seus aplicativos*,
   escolha o ícone da web (`</>`) e registre o app.
5. Copie os valores do `firebaseConfig` que aparece para `FIREBASE_CONFIG` em
   `js/produtos.js`.

**Regras do Firestore** — qualquer visitante lê o catálogo, mas ninguém escreve
sem estar autenticado:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{colecao}/{doc} {
      allow read: if colecao in ['categorias', 'produtos'];
      allow write: if request.auth != null;
    }
  }
}
```

⚠️ Com estas regras, a escrita exige login do Firebase Authentication, que **não
está integrado ao painel** — o login do painel é local (veja Segurança). Para o
painel escrever, use uma destas opções:

- **Recomendado:** ativar *Authentication → Anônimo* no Firebase e trocar
  `allow write: if request.auth != null` por uma verificação de UID específico,
  autorizando só o aparelho do administrador.
- **Mais simples, menos seguro:** `allow write: if true` — funciona de imediato,
  mas qualquer pessoa que descubra o endereço do projeto pode gravar. Só use para
  testar.

**Não pude testar o caminho do Firebase daqui**: o domínio `gstatic.com`, que serve
o SDK, é bloqueado pela política de rede deste ambiente. Todo o restante foi
testado por completo no modo navegador. Quando o SDK não carrega, o sistema cai
no modo local automaticamente, sem erro — comportamento verificado.

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
