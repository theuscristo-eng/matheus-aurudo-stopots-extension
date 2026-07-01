# Matheus Aurudo

Extensao do Chrome para uso pessoal no StopotS. Ela abre um painel fixo dentro do site, detecta a letra/categorias da rodada e preenche os campos reconhecidos com respostas do banco local.

## Recursos

- Painel fixo dentro da pagina, sem fechar ao clicar fora.
- Painel arrastavel, com posicao salva no navegador.
- Tema visual hacker com fundo personalizado.
- Botao `INJETAR TUDO` para preencher os campos reconhecidos.
- Banco local com milhares de respostas separadas por categoria.
- Aprendizado local: respostas digitadas manualmente podem ser lembradas para proximas rodadas.
- Fallback opcional por API local quando o banco nao tiver resposta.
- Sem backend, sem cadastro e sem chamadas externas.

## Como instalar no Chrome

1. Baixe ou clone este repositorio.
2. Abra `chrome://extensions/`.
3. Ative `Modo do desenvolvedor`.
4. Clique em `Carregar sem compactacao`.
5. Selecione a pasta deste projeto.
6. Entre no StopotS: `https://stopots.com/pt/`.

Se voce atualizar os arquivos depois, volte em `chrome://extensions/` e clique em `Recarregar` na extensao.

## Como usar

1. Abra uma rodada no StopotS.
2. Clique no icone da extensao se o painel nao aparecer.
3. Arraste o painel para onde quiser.
4. Clique em `INJETAR TUDO`.

## Aprendizado local

A extensao salva no proprio navegador respostas validas que voce digitar manualmente.

Exemplo: se a letra for `M`, a categoria for `Animal` e voce digitar `Macaco`, a extensao pode lembrar essa resposta em proximas rodadas.

Essas respostas ficam no `localStorage` do navegador, usando a chave `matheusAurudoLearnedAnswers`.

## Fallback por API local

O banco local continua sendo a fonte principal. Se nao houver resposta, a extensao pode consultar uma API local opcional.

Para ativar, abra o console do navegador no StopotS e defina:

```js
localStorage.setItem("matheusAurudoFallbackEndpoint", "http://localhost:8787/answer");
```

A API deve responder JSON neste formato:

```json
{ "answer": "exemplo" }
```

Ou:

```json
{ "answers": ["exemplo", "extra"] }
```

A extensao so aceita fallback local em `localhost` ou `127.0.0.1`, para evitar expor chaves ou depender de servicos externos dentro do GitHub publico.

## Arquivos principais

- `manifest.json`: configuracao da extensao.
- `background.js`: abre/injeta o painel quando o icone da extensao e clicado.
- `content.js`: detecta letra/categorias e preenche os campos.
- `page-bridge.js`: observa sinais internos da pagina do jogo.
- `data.js`: banco local de categorias e respostas.
- `styles.css`: tema visual do painel.

## Observacoes

- A extensao depende do layout e dos sinais atuais do StopotS. Se o site mudar, pode ser necessario ajustar a deteccao.
- As respostas principais sao locais e podem ser editadas em `data.js`.
- O fallback por API local e opcional e fica desativado ate voce configurar `matheusAurudoFallbackEndpoint`.
- Este projeto e fornecido como esta, para estudo e uso pessoal.
