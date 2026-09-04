# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

Decisões técnicas da fase, produzidas na etapa de pesquisa (skill `research`). Cada decisão
tem contexto, escolha e trade-off. Rastreável ao plano (`phase-03-videos.md`) e ao código.

## TD-03.1 — Object Storage: MinIO (S3-compatível) para os arquivos de vídeo

**Contexto:** vídeos de até 10GB não podem ir para o Postgres nem para o filesystem do container
da API. **Decisão:** usar **MinIO** (API S3) como object storage, acessado pelo AWS SDK v3
(`@aws-sdk/client-s3`). Em produção, troca-se o endpoint por S3 real sem mudar o código.
**Trade-off:** um serviço a mais na infra, em troca de uploads/downloads escaláveis e URLs
pré-assinadas.

## TD-03.2 — Upload direto ao storage via URL pré-assinada (presigned PUT)

**Contexto:** trafegar 10GB pela API Node consumiria memória/CPU e prenderia o event loop.
**Decisão:** a API gera uma **presigned URL** (multipart quando necessário) e o cliente faz o
upload **direto no MinIO**; a API só registra o vídeo e recebe a confirmação. **Alternativa
descartada:** streaming do arquivo através da API (`multipart/form-data`) — simples, mas não
escala para 10GB. **Trade-off:** fluxo de upload em 2 passos (registrar → confirmar).

## TD-03.3 — Fila de processamento: BullMQ sobre Redis

**Contexto:** transcode/thumbnail são pesados e assíncronos. **Decisão:** enfileirar um job por
vídeo em **BullMQ (Redis)**; a API é o *producer*, o worker é o *consumer*. **Alternativa
descartada:** processar inline no request. **Trade-off:** Redis novo na infra, em troca de
retمy, concorrência e isolamento do processamento.

## TD-03.4 — Worker de vídeo em processo separado com FFmpeg

**Contexto:** o processamento não pode competir com o request/response da API. **Decisão:**
**worker dedicado** (`worker/`) consumindo a fila, usando **FFmpeg** (via `fluent-ffmpeg`) para
gerar thumbnail e uma versão normalizada (H.264/AAC MP4). **Trade-off:** um processo/deploy a
mais; FFmpeg como dependência de sistema (na imagem do worker).

## TD-03.5 — Streaming com HTTP Range

**Contexto:** o player precisa buscar (seek) sem baixar o arquivo inteiro. **Decisão:** endpoint
de streaming que honra o header **`Range`** (respostas `206 Partial Content`), lendo faixas do
objeto no MinIO. Download completo em endpoint separado. **Trade-off:** implementação de range
manual, em troca de players compatíveis e seek eficiente.

## TD-03.6 — Modelo de estados do vídeo

**Contexto:** o vídeo passa por etapas assíncronas. **Decisão:** máquina de estados
`uploading → uploaded → processing → ready | failed`, persistida na entidade `Video`; transições
disparadas por API (confirmação) e worker (início/fim do processamento). **Trade-off:** exige
disciplina de transição, em troca de status observável para o cliente.

## Reuso de padrões existentes (Fases 01–02)

- Config via `registerAs` (`src/config/*.config.ts`) + validação Joi (`env.validation.ts`).
- Migrations TypeORM versionadas; `DomainException` + `DomainExceptionFilter` para erros
  (`src/common/`); Guard JWT global para proteger os endpoints de vídeo.
