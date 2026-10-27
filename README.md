# IC-Assistant

Assistente virtual do **Instituto de Computação da UFMT**. Responde dúvidas de alunos,
professores e técnicos (processos, grade curricular, calendário acadêmico, eventos) usando
**somente** os documentos oficiais do IC. Quando a resposta não está nos documentos, ele diz
isso e encaminha para o contato certo, em vez de inventar.

## Situação

| Fase | O que entrega | Estado |
|---|---|---|
| 1. Núcleo | Ingestão de documentos, busca, respostas com citação, avaliação automática (linha de comando) | **pronta para testar com documentos reais** |
| 2. Chat | API, login, histórico por usuário, conversa com contexto, respostas em streaming, limite diário, interface web | **pronta** (falta testar com a chave da API e documentos reais) |
| 3. Painel da secretaria | Upload de documentos, data/categoria, "substitui", perguntas sem resposta | a fazer |
| 4. Deploy | Servidor da UFMT com Docker, HTTPS, logs | a fazer |
| 5. Geração de documentos | Requerimentos preenchidos a partir dos modelos da secretaria | a fazer |

## Como funciona

```
arquivo (PDF, DOCX, MD, TXT)
  → leitura com página e seção (PDF escaneado: transcrito uma vez pelo Claude)
  → trechos de ~1500 caracteres (tabelas divididas por linha, repetindo o cabeçalho)
  → embeddings bge-m3 (local, multilíngue) + índice textual em português sem acentos
  → PostgreSQL + pgvector

pergunta
  → se for continuação ("e para SI?"), é reescrita com o histórico para a busca entender sozinha
  → busca híbrida: vetorial (significado) + textual (palavras exatas), fundidas por RRF
  → só documentos ativos (o substituído sai da busca)
  → Claude com os trechos como "search results" e citações ligadas
  → resposta; sem citação = não fundamentada (vira "não encontrei")
```

Regras que seguram a alucinação:

- O assistente só usa os trechos recebidos. Se não houver trecho relevante, nem chama a API.
- **Documento mais novo vence**: cada documento tem data, e a data vai junto de cada trecho. Um
  documento pode ser marcado como substituído por outro (`ic substituir`) e deixa de ser usado.
- A **data de hoje** (fuso de Cuiabá) vai na pergunta, para "quando acaba o semestre?" fazer sentido.
- As citações da API ficam registradas em toda resposta; a interface mostra a fonte quando pedirem.
- `ic avaliar` mede, com perguntas de resposta conhecida, quantas respostas estão certas e quantas
  inventaram algo.

## Primeiros passos

Precisa de [Docker](https://www.docker.com/), [uv](https://docs.astral.sh/uv/) e, para perguntar,
uma chave da API da Anthropic.

```bash
cp .env.example .env            # e coloque a ANTHROPIC_API_KEY
docker compose up -d db         # Postgres com pgvector na porta 5433
cd backend
uv sync                         # instala Python 3.12 e as dependências
uv run ic migrar                # cria as tabelas
```

Ingerir documentos (na primeira vez o modelo bge-m3, ~2 GB, é baixado):

```bash
uv run ic ingerir ../documentos/calendario_2026.pdf --categoria calendario --data 15/01/2026
uv run ic ingerir ../documentos/faq/ --categoria faq     # uma pasta inteira
uv run ic documentos                                     # lista o que está no banco
```

A pasta `documentos/` na raiz está no `.gitignore`; use-a para os arquivos de trabalho.

Perguntar:

```bash
uv run ic buscar "quando acaba o semestre?"      # só a busca, sem custo de API
uv run ic perguntar "quando acaba o semestre?"   # resposta completa
uv run ic perguntar "quando acaba o semestre?" --fontes --hoje 01/12/2026
```

## Site (API + interface)

Em desenvolvimento são dois processos: a API (porta 8000) e o Vite (porta 5173), que repassa
`/api` para a API.

```bash
cd backend && uv run ic servidor --recarregar
```

```bash
cd frontend && npm install && npm run dev
```

Abra http://localhost:5173 e crie uma conta. Para dar acesso de secretaria a alguém (painel da
Fase 3, sem limite diário): `uv run ic admin email@ufmt.br`.

O que a interface faz:

- Cadastro com vínculo (aluno, docente, técnico, outro) e curso; login com sessão em cookie
  `HttpOnly`; "esqueci minha senha" por e-mail (link vale 1 hora e derruba as sessões abertas).
- Chat com a resposta aparecendo enquanto é gerada, Markdown, botão de fontes e histórico de
  conversas por usuário (renomear e apagar pela API).
- Limite diário de perguntas por pessoa (`LIMITE_DIARIO_PERGUNTAS`, renova à meia-noite de Cuiabá).
- Modo claro e escuro, seguindo o sistema; layout de celular com menu lateral recolhível.

Segurança: senhas com Argon2; no banco fica só o hash do token de sessão; login trava por 15
minutos após 5 senhas erradas; a API só aceita JSON em POST/PATCH e não libera CORS (proteção
contra CSRF); uma pessoa não enxerga conversa de outra (404).

## Comandos

| Comando | Para quê |
|---|---|
| `ic migrar` | Cria ou atualiza as tabelas |
| `ic servidor [--host] [--porta] [--recarregar]` | Sobe a API web |
| `ic admin EMAIL [--remover]` | Dá ou tira acesso de secretaria |
| `ic ingerir CAMINHO... [--categoria] [--data dd/mm/aaaa] [--titulo] [--forcar]` | Adiciona documentos. O mesmo arquivo não entra duas vezes |
| `ic documentos` | Lista documentos, status e quantos trechos cada um tem |
| `ic substituir ANTIGO NOVO` | O documento NOVO passa a valer no lugar do ANTIGO |
| `ic remover ID` | Apaga um documento e seus trechos |
| `ic buscar "pergunta"` | Mostra os trechos que a busca acha (sem chamar o Claude) |
| `ic perguntar "pergunta" [--fontes] [--hoje]` | Responde usando os documentos |
| `ic avaliar [--arquivo]` | Roda `evals/perguntas.yaml` e mede acertos e invenções |

## Avaliação

`evals/perguntas.yaml` guarda perguntas com a resposta esperada, tirada dos documentos, e
perguntas que **não** têm resposta neles (`deve_recusar: true`). `ic avaliar` responde cada uma
e um juiz (Claude) marca se acertou, se inventou algo e se recusou. O resultado completo fica em
`evals/resultados/`.

Use sempre que mudar algo (prompt, tamanho dos trechos, modelo) e compare os números. Para testar
um modelo mais barato, troque `LLM_MODEL` no `.env` e rode de novo. A meta é ter de 30 a 50
perguntas, sendo umas 10 sem resposta.

## Decisões

- **Sem LangChain**: o SDK oficial `anthropic` resolve em poucos arquivos o que precisamos e
  não traz a confusão de versões que derrubou a primeira versão.
- **bge-m3 local**: bom em português, sem custo por uso e sem um segundo fornecedor. Roda na CPU.
- **Busca híbrida**: termos como "semana acadêmica" ou "matéria de verão" precisam de busca por
  palavra; a vetorial cobre perguntas com outras palavras ("quando termina" × "fim do semestre").
- **Citações da API** em vez de pedir ao modelo que cite por texto: a ligação entre resposta e
  trecho vem da própria API e dá para conferir.
- **Fallback do servidor** (`fallbacks: "default"`): se o modelo recusar uma pergunta por
  política, a API tenta outro modelo na mesma chamada.

## Testes

```bash
cd backend
uv run pytest            # os testes de banco precisam do `docker compose up -d db`
uv run ruff check .
cd ../frontend
npm run build            # checa os tipos e gera o build
```
