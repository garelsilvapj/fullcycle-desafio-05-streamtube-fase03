---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-09-04
scope_description: "Upload de vídeos de até 10GB sem trafegar pela API, object storage S3-compatível, fila de processamento em segundo plano, worker FFmpeg (duração, metadados e thumbnail), URL única por vídeo, reprodução via streaming com HTTP Range e download."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — API que registra o vídeo, assina as URLs de upload, publica o job de
  processamento e serve streaming/download.
- `worker/` — processo separado que consome a fila e executa FFmpeg/ffprobe.
- `next-frontend/` — fora do escopo desta fase (a fatia de UI é tratada em
  `docs/decisions/technical-decisions-phase-03-videos-frontend.md`).

O object storage **não é uma escolha em aberto**: o `docs/project-plan.md` e o
`docs/diagrams/software-arch.mermaid` já apontam para S3-compatível. TD-03.1 decide *como* usá-lo
(implementação local, organização de buckets/chaves), não *qual*. A decisão de stack genuinamente
aberta da fase é a fila (TD-03.3), marcada como "TBD" no plano do projeto.

---

## TD-03.1: Implementação do Object Storage

**Scope:** Backend + Infra

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** Arquivos de até 10GB não cabem no Postgres nem no filesystem efêmero do container da
API. A arquitetura-alvo já define "Object Storage (S3/MinIO)". Resta decidir o que roda no Compose
local e como o código fala com ele sem amarrar-se a um fornecedor.

**Options:**

### Option A: MinIO no Compose, acessado pelo AWS SDK v3
- Container `minio/minio` no `compose.yaml`, bucket criado por um serviço one-shot `minio/mc`. O
  código usa `@aws-sdk/client-s3` com `forcePathStyle: true` e endpoint configurável.
- **Pros:** API idêntica à do S3 — trocar para S3 real em produção é mudar variável de ambiente, não
  código. Suporta presigned URLs e multipart upload, que TD-03.2 exige. Roda inteiro no Compose, o
  que atende à regra "infra real, testada" (os testes de integração exercitam MinIO de verdade).
- **Cons:** Mais um serviço e um volume na stack local. O SDK da AWS é pesado no bundle.

### Option B: Volume Docker no filesystem, servido pela API
- Gravar os arquivos num volume montado e servir por `createReadStream`.
- **Pros:** Zero dependências novas; trivial de implementar.
- **Cons:** Não tem presigned URL, então o upload de 10GB obrigatoriamente passaria pela API —
  colide de frente com TD-03.2 e com o critério de não travar o sistema. Não escala horizontalmente
  (o volume vira estado local da API). Divergiria da arquitetura-alvo documentada.

### Option C: Large Objects / `bytea` no PostgreSQL
- Guardar o binário no próprio banco.
- **Pros:** Um serviço a menos; transacional junto com os metadados.
- **Cons:** Inadequado para 10GB — infla WAL, backup e replicação. `bytea` tem limite de 1GB por
  valor. Streaming por Range viraria consulta de substring. Antipadrão reconhecido para mídia.

**Recommendation:** **MinIO com AWS SDK v3** — é a única opção que entrega presigned URLs, que são a
base da estratégia de upload da fase. O custo é um container; o retorno é paridade com produção.

**Decision:** A (MinIO + `@aws-sdk/client-s3`)

**Organização de chaves:** bucket único `streamtube-videos`, prefixo
`videos/<channelId>/<videoId>/` e nomes fixos por artefato (`original`, `processed.mp4`,
`thumb.jpg`, `thumb-custom`). Agrupar por vídeo permite apagar tudo com um `deleteObjects` na
exclusão. Implementado em `nestjs-project/src/videos/videos.constants.ts`.

---

## TD-03.2: Estratégia de upload de arquivos de até 10GB

**Scope:** Backend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance ·
Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** É o critério mais duro da fase — passar o arquivo pela API "de forma que trave o
sistema" é reprova automática. Node é single-threaded; 10GB atravessando o event loop consome
memória, CPU e prende o processo por dezenas de minutos.

**Options:**

### Option A: Presigned URL — o cliente envia direto ao storage
- A API cria a linha do vídeo, gera uma URL assinada e devolve. O byte nunca toca a API. Acima do
  limiar configurado, devolve um plano **multipart** (uma URL assinada por parte) em vez de um único
  PUT.
- **Pros:** A API só faz trabalho de metadados — latência constante independente do tamanho do
  arquivo. Multipart é obrigatório de qualquer forma: o PUT único do S3 tem teto de 5GB, então 10GB
  **exige** multipart. Partes falhas são reenviadas isoladamente. O pré-cadastro como rascunho cai
  naturalmente: a linha nasce no passo 1, antes de existir qualquer byte.
- **Cons:** Fluxo em dois/três passos (registrar → enviar → confirmar), que o cliente precisa
  orquestrar. A URL assinada precisa ser alcançável pelo navegador, o que obriga a separar o
  endpoint interno do público.

### Option B: `multipart/form-data` pela API (Multer / `FileInterceptor`)
- Upload convencional, a API recebe e repassa ao storage.
- **Pros:** Um passo só; o cliente é um `<form>`.
- **Cons:** É exatamente o caminho que o enunciado marca como errado. Buffer em disco ou memória do
  container da API, timeouts de proxy, e um upload lento segura um worker HTTP o tempo todo. Sem
  retomada: uma queda aos 9GB reinicia do zero.

### Option C: Protocolo resumível (tus) com servidor próprio
- `tus-node-server` com upload retomável por offset.
- **Pros:** Retomada real, padronizada, boa UX em rede instável.
- **Cons:** Os bytes continuam passando pela API (mesmo problema do B) ou exigem um serviço tus
  separado — infra nova sem contrapartida, já que o multipart do S3 já entrega retomada por parte.
  Dependência a mais fora do ecossistema Nest.

**Recommendation:** **Presigned URL com multipart acima do limiar** — é a única opção que mantém a
API fora do caminho dos bytes e a única que suporta 10GB de fato (limite de 5GB do PUT único).

**Decision:** A (presigned PUT; multipart automático acima de `S3_MULTIPART_THRESHOLD`)

**Consequência de configuração:** as URLs precisam ser assinadas com o host que o cliente enxerga.
Daí a separação entre `S3_ENDPOINT` (interno, `http://minio:9000`, usado pela API para falar com o
storage) e `S3_PUBLIC_ENDPOINT` (usado só para assinar o que vai para o navegador). Essa é a única
exceção legítima à regra "nunca `localhost`" do CLAUDE.md, e está anotada em
`src/config/storage.config.ts`.

---

## TD-03.3: Tecnologia de fila de processamento

**Scope:** Backend + Infra

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** É a decisão de stack em aberto da fase — o `docs/project-plan.md` a deixa como "TBD".
Transcodificar e extrair frames é trabalho de CPU que dura minutos e não pode acontecer no ciclo
request/response. A fila precisa de: retry com backoff, idempotência (confirmar duas vezes não pode
processar duas vezes), consumo por um processo separado e capacidade de subir no Compose.

**Options:**

### Option A: BullMQ sobre Redis
- Fila em Redis com `@nestjs/bullmq` no producer e o pacote `bullmq` puro no worker.
- **Pros:** Padrão de fato no ecossistema Node/Nest, com integração oficial (`@nestjs/bullmq`).
  Retry com backoff exponencial, `attempts` e detecção de job travado (`stalled`) vêm de fábrica.
  `jobId` definido pelo chamador dá **deduplicação nativa**: usar `jobId = videoId` faz a fila
  ignorar um segundo enfileiramento do mesmo vídeo, que é exatamente a idempotência que o fluxo
  registrar→confirmar precisa. Redis é um container leve (`redis:7-alpine`). O worker pode consumir
  a fila sem carregar o NestJS inteiro.
- **Cons:** Mais um serviço com estado na infra. Redis não é durável por padrão (mitigável com
  `appendonly yes`, como feito no `compose.prod.yaml`). Sem roteamento por tópico — mas a fase só
  tem um tipo de job.

### Option B: RabbitMQ via `@nestjs/microservices`
- Broker AMQP dedicado, com o worker como microserviço Nest.
- **Pros:** Broker de mensageria de verdade: durabilidade, ack/nack, dead-letter queues e roteamento
  por exchange. Escala melhor para muitos tipos de evento.
- **Cons:** Bem mais peso operacional (Erlang, plugin de management, definição de exchanges) para
  uma fila só. Retry/backoff não são nativos — exigem DLX e TTL montados à mão. Não tem deduplicação
  por id de mensagem, então a idempotência viraria código nosso. Sobrecarga desproporcional ao
  problema desta fase.

### Option C: `pg-boss` (fila dentro do PostgreSQL)
- Usa o Postgres que já existe como backend de fila (`SKIP LOCKED`).
- **Pros:** **Zero infra nova** — reaproveita o banco já no Compose. Enfileirar na mesma transação
  que grava o vídeo elimina a janela "commitou mas não enfileirou". Durável e transacional de graça.
- **Cons:** Polling em vez de push, então há latência de partida e carga constante no banco. Coloca
  trabalho de fila no mesmo Postgres que serve as requisições — acoplamento que a arquitetura-alvo
  evita ao desenhar a fila como container próprio. Ecossistema e ferramental bem menores que os do
  BullMQ.

**Recommendation:** **BullMQ sobre Redis** — a deduplicação por `jobId` e o backoff exponencial
nativos resolvem, sem código extra, os dois riscos reais do fluxo (enfileiramento duplicado na
confirmação e falha transitória do FFmpeg). RabbitMQ é infra demais para um único tipo de job, e
pg-boss economiza um container ao custo de acoplar processamento pesado ao banco transacional.
A arquitetura-alvo do projeto já prevê "Message Queue" como container separado, o que Redis atende.

**Decision:** A (BullMQ + Redis, fila `video-processing`)

---

## TD-03.4: Execução do worker e extração de metadados/thumbnail

**Scope:** Worker + Infra

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados) ·
Geração automática de thumbnail a partir de um frame do vídeo

**Context:** Decidido *que* existe uma fila, falta decidir *quem* a consome e com quê. FFmpeg é uma
dependência de sistema (binário, não pacote npm) e o processamento satura CPU.

**Options:**

### Option A: Container separado, Node puro + `fluent-ffmpeg`
- Projeto `worker/` independente, com Dockerfile próprio que instala `ffmpeg`, consumindo a fila com
  `new Worker(...)` do BullMQ e falando com o Postgres por SQL direto (`pg`).
- **Pros:** Isolamento real de CPU — transcodificação não disputa o event loop da API. Escala e
  reinicia independentemente (`WORKER_CONCURRENCY`). O binário do FFmpeg (~100MB) fica só na imagem
  do worker, não na da API. Corresponde ao container "Video Worker (FFmpeg)" da arquitetura-alvo.
  `fluent-ffmpeg` expõe `ffprobe` (duração, resolução, codec) e `screenshots` (frame → thumbnail)
  com API declarativa.
- **Cons:** Um deploy e um `package.json` a mais. Sem TypeORM no worker, as transições de status são
  SQL escrito à mão — e a convenção de chaves do storage fica duplicada entre os dois projetos.

### Option B: `@Processor` do BullMQ dentro do processo da API
- O consumidor vive no mesmo app Nest, como um provider.
- **Pros:** Um projeto só; reaproveita entidades TypeORM, config e `DomainException` sem duplicar
  nada. Muito menos cerimônia.
- **Cons:** Transcodificação de CPU no mesmo processo que atende HTTP — degrada latência de todas as
  rotas, que é justamente o que a fase quer evitar. Obrigaria FFmpeg na imagem da API. Escalar
  processamento passaria a significar escalar a API junto.

### Option C: Serviço gerenciado de transcodificação (AWS Elastic Transcoder / MediaConvert)
- Delegar o processamento para fora.
- **Pros:** Sem infra de CPU própria; escala sozinho; formatos adaptativos prontos.
- **Cons:** Não roda no Compose — inviabiliza "infra real subindo localmente" e os testes de
  integração que o desafio exige. Amarra a um fornecedor e a custo por minuto.

**Recommendation:** **Container separado com `fluent-ffmpeg`** — isolar CPU é a razão de existir da
fila; consumi-la dentro da API (Opção B) desfaria metade do ganho.

**Decision:** A (`worker/`, imagem própria com FFmpeg + `tini`, usuário não-root)

**Pipeline:** baixar `original` → `ffprobe` (duração/resolução/codec) → `screenshots` (1 frame) →
transcodificar para H.264/AAC com `-movflags +faststart` (indispensável para o streaming progressivo
de TD-03.5) → subir `processed.mp4` e `thumb.jpg` → gravar duração e tamanho.

---

## TD-03.5: Estratégia de streaming e de download

**Scope:** Backend

**Capability:** Reprodução via streaming (sem necessidade de download completo) · Download do vídeo
pelo usuário

**Context:** O `<video>` do navegador precisa iniciar a reprodução e permitir *seek* sem baixar o
arquivo inteiro. Download é requisito separado e tem o comportamento oposto: entregar tudo.

**Options:**

### Option A: Endpoint da API que honra `Range` e responde `206`
- A API lê a faixa pedida no storage (`GetObjectCommand` com `Range`) e devolve `206 Partial
  Content` com `Content-Range`; sem o header, `200` com o arquivo; faixa inválida, `416`.
- **Pros:** É o contrato que todo player HTML5 já fala — seek funciona sem player especial. A API
  mantém o controle de autorização a cada requisição (essencial quando rascunho é privado e
  publicado é público). Trafega só a janela pedida (limitada a 1 MiB por requisição aberta), não o
  arquivo.
- **Cons:** Os bytes passam pela API — mas em blocos pequenos e sob demanda, diferente do upload.
  Exige implementar o parsing de `Range` (`bytes=S-E`, `bytes=S-`, `bytes=-N`) à mão.

### Option B: Redirect `302` para uma presigned GET do storage
- A API valida o acesso e redireciona; o MinIO/S3 serve os bytes e trata Range sozinho.
- **Pros:** A API sai completamente do caminho dos dados. O storage já implementa Range corretamente.
- **Cons:** A URL assinada vaza do contexto da requisição — quem a copiar acessa o vídeo até ela
  expirar, sem nova checagem de autorização. Expõe o endpoint do storage ao cliente.

### Option C: Empacotamento adaptativo (HLS/DASH)
- Segmentar em múltiplas qualidades e servir manifesto `.m3u8`.
- **Pros:** Qualidade adaptativa, padrão da indústria para streaming de verdade.
- **Cons:** Multiplica o custo de processamento e de storage por qualidade, exige player externo
  (hls.js) e está fora do escopo do plano, que pede apenas "reprodução via streaming sem download
  completo".

**Recommendation:** **Range/206 na API para streaming, redirect presigned para download** — o
streaming precisa reavaliar autorização a cada requisição, então vale pagar o proxy; o download é um
evento único de um arquivo inteiro, onde o redirect (Opção B) evita ocupar a API por minutos.

**Decision:** A para `GET /videos/:id/stream`; B para `GET /videos/:id/download` e
`GET /videos/:id/thumbnail`

---

## TD-03.6: Modelo de estados do vídeo

**Scope:** Backend

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload

**Context:** Como o upload não passa pela API e o processamento é assíncrono, o vídeo existe por
vários minutos num estado intermediário. O cliente precisa saber em qual, e o worker precisa de um
estado que possa reivindicar sem corrida com outro worker.

**Options:**

### Option A: Enum de cinco estados `uploading → uploaded → processing → ready | failed`
- Coluna `status` com tipo enum no Postgres.
- **Pros:** Distingue "linha criada, bytes ainda não chegaram" (`uploading`) de "bytes confirmados,
  esperando worker" (`uploaded`) — a fronteira exata onde o job é enfileirado. Permite transição
  condicional (`UPDATE ... WHERE status = ANY(...)`), que dá exclusão mútua entre workers sem lock
  explícito. `failed` guarda o motivo em `error`, e voltar de `failed` para `uploaded` reprocessa.
- **Cons:** Cinco estados para o cliente entender; migration nova a cada estado futuro.

### Option B: Flags booleanas (`uploaded`, `processed`, `has_error`)
- **Pros:** Sem migration para adicionar situação nova.
- **Cons:** Permite combinações inválidas (`processed = true` com `uploaded = false`). Sem transição
  atômica — dois workers reivindicariam o mesmo vídeo. Estado real vira regra espalhada no código.

### Option C: Quatro estados `draft → processing → ready | error`
- Literalmente o ciclo citado no enunciado.
- **Pros:** Mais simples de explicar; casa com o vocabulário do enunciado.
- **Cons:** Junta num único `draft` dois momentos operacionalmente distintos (antes e depois de os
  bytes chegarem), que é justamente onde o enfileiramento acontece. Sem esse corte, confirmar um
  upload que nunca terminou enfileiraria um job fadado a falhar.

**Recommendation:** **Cinco estados** — a separação `uploading`/`uploaded` é o que torna o
enfileiramento confiável, e a transição condicional em SQL é o que impede processamento duplicado.
Os nomes diferem do enunciado (`uploading` cobre "rascunho", `failed` cobre "erro"), mas o ciclo
exigido está inteiramente contido neste.

**Decision:** A (`uploading | uploaded | processing | ready | failed`)

**Política de falha:** tentativas intermediárias voltam para `uploaded` para que o backoff do BullMQ
tente de novo; a última tentativa grava `failed` com a mensagem truncada em 500 caracteres.

---

## TD-03.7: Estratégia de URL única por vídeo

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Cada vídeo precisa de um identificador público estável, sem colisão, que caiba numa URL
curta e não exponha informação interna.

**Options:**

### Option A: Slug aleatório curto (11 caracteres, CSPRNG) com índice único
- Gerado com `randomInt` sobre um alfabeto URL-safe de 64 caracteres, coluna `slug` com índice
  único e retry em caso de violação.
- **Pros:** 64^11 ≈ 7,3×10^19 combinações — colisão é desprezível, e o índice único garante que,
  mesmo assim, o banco rejeita duplicata em vez de sobrescrever. Curto o bastante para compartilhar.
  Não é enumerável: ninguém descobre vídeos incrementando um número. Independe do título, então
  renomear o vídeo não quebra links.
- **Cons:** Coluna e índice a mais; exige tratar a violação de unicidade (implementado com até 5
  tentativas em `saveWithUniqueSlug`).

### Option B: Usar o próprio UUID do vídeo na URL
- **Pros:** Zero código e zero coluna nova — a unicidade já existe.
- **Cons:** 36 caracteres numa URL de compartilhamento. Vaza a chave primária interna, acoplando a
  URL pública ao identificador usado nas rotas autenticadas.

### Option C: Slug derivado do título com sufixo de desambiguação
- `meu-video`, `meu-video-2`, …
- **Pros:** URL legível e boa para SEO.
- **Cons:** Exige consulta de colisão a cada gravação, com corrida entre requisições concorrentes.
  Títulos iguais são comuns. Renomear obriga a escolher entre quebrar o link e manter slug
  incoerente. Títulos com acento/emoji precisam de normalização.

**Recommendation:** **Slug aleatório com índice único** — resolve o requisito literal ("sem conflito
com outros vídeos") no nível do banco, e não no nível da esperança.

**Decision:** A (`slug` varchar(11), índice `UQ_videos_slug`, retry na violação)

---

## Decisions Summary

| ID | Decision | Recommendation | Choice |
|----|----------|---------------|--------|
| TD-03.1 | Implementação do Object Storage | MinIO + AWS SDK v3 | A (MinIO, bucket `streamtube-videos`) |
| TD-03.2 | Estratégia de upload de até 10GB | Presigned URL + multipart | A (presigned PUT / multipart) |
| TD-03.3 | Tecnologia de fila | BullMQ sobre Redis | A (BullMQ + Redis) |
| TD-03.4 | Execução do worker e FFmpeg | Container separado + `fluent-ffmpeg` | A (`worker/` isolado) |
| TD-03.5 | Streaming e download | Range/206 na API; presigned no download | A (stream) + B (download/thumbnail) |
| TD-03.6 | Modelo de estados do vídeo | Enum de cinco estados | A (`uploading…failed`) |
| TD-03.7 | URL única por vídeo | Slug aleatório com índice único | A (`slug` varchar(11)) |

## Reuso de padrões existentes (Fases 01–02)

Nenhuma decisão nova; são convenções herdadas e aplicadas tal como estão:

- Config por `registerAs` (`src/config/*.config.ts`) validada com Joi em `env.validation.ts`.
- `DomainException` + `DomainExceptionFilter` global (`src/common/`) para o catálogo `VIDEO_*`.
- Guard JWT global; o canal do vídeo é resolvido do usuário autenticado (relação 1:1 da Fase 02).
- Migrations TypeORM versionadas; Docker com nome de serviço como host.
