# Phase 03 — Context

## Objetivo da fase

Implementar **Upload e Processamento de Vídeos** no StreamTube: enviar arquivos de até 10GB,
processá-los de forma assíncrona (thumbnail + normalização), e disponibilizá-los para
**streaming** e **download** por uma URL única. Os vídeos pertencem a um **canal** (1 canal por
usuário, criado no cadastro — Fase 02).

## O que já existe (Fases 01–02)

- Backend **NestJS 11 + TypeORM + PostgreSQL 17** em `nestjs-project/`.
- Módulos `auth/`, `users/`, `channels/`, `mail/`, `common/`, `config/`, `database/`.
- Guard JWT global, `DomainException` + filtro de exceções, `ValidationPipe` global, rate limiting,
  migrations versionadas e seeds.
- Infra atual (`compose.yaml`): API, PostgreSQL e Mailpit.

## O que esta fase adiciona

- Entidade/tabela **Video** e o módulo `videos/`.
- **Object storage** (MinIO) e serviço de acesso (presigned URLs, range reads).
- **Fila** (BullMQ/Redis) e **worker** de processamento (FFmpeg).
- Endpoints de **registro/confirmação de upload**, **streaming (Range)** e **download**.
- Infra nova no `compose.yaml`: MinIO, Redis e o serviço `worker`.

## Restrições e premissas

- Vídeo pertence a um canal; só o dono do canal pode enviar/gerenciar (autorização por JWT).
- Upload direto ao storage (presigned) para não passar 10GB pela API.
- Processamento idempotente por `videoId` (reprocessável).
- Sem broker externo além do Redis da fila.

## Referências

- Decisões: `docs/decisions/technical-decisions-phase-03-videos.md`.
- Arquitetura-alvo: `docs/diagrams/software-arch.mermaid` (storage + fila + worker previstos).
- Formato de fase: `docs/phases/phase-02-auth.md`.
