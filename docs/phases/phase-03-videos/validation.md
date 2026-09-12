---
kind: phase
name: phase-03-videos
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-09-11T23:07:28-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-09-11T23:06:26-03:00"
  docs/phases/phase-03-videos/phase-03-videos.md: "2026-09-11T23:03:29-03:00"
issues: []
advisories: []
---

# phase-03-videos — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

_None._ As telas de upload, lista e player são explicitamente diferidas para
`docs/phases/phase-03-videos-frontend/` (ver `## Non-UI / Deferred Capabilities` no contexto).

## Resolved Issues

Pendências levantadas em rodadas anteriores desta validação e já fechadas:

1. **Upload de 10GB trafegando pela API.** Resolvido por TD-03.2: upload direto ao storage por URL
   pré-assinada, com plano multipart acima do limiar. O PUT único do S3 tem teto de 5GB, então
   multipart não é otimização e sim requisito — registrado no `## Addendum` do plano.
2. **Reprocessamento concorrente do mesmo vídeo.** Resolvido em dois níveis: `jobId = videoId` faz a
   fila deduplicar o enfileiramento, e as transições de status são condicionais
   (`UPDATE ... WHERE status = ANY(...)`), o que impede dois workers de reivindicarem o mesmo vídeo.
   Contratos em `### Events / Messages`.
3. **URL única sem decisão correspondente.** O plano usava `slug` sem TD que o justificasse.
   Resolvido com a inclusão de **TD-03.7**, que compara slug aleatório, UUID e slug derivado do
   título, e fixa índice único + retry na violação.
4. **Presigned URL inalcançável pelo cliente.** As URLs eram assinadas com o endpoint interno do
   Docker (`http://minio:9000`), válido só dentro da rede do Compose. Resolvido separando
   `S3_ENDPOINT` de `S3_PUBLIC_ENDPOINT`, com a exceção à regra de rede anotada em TD-03.2 e em
   `src/config/storage.config.ts`.
5. **Catálogo de erros incompleto ante os contratos.** `### Error Catalog` foi estendido para cobrir
   todos os caminhos de erro das rotas, incluindo `416` de faixa inválida no streaming.

## Checklist

- [x] Toda decisão do plano tem TD correspondente em `technical-decisions-phase-03-videos.md`.
- [x] Data Model cobre todos os campos usados nos contratos e no worker (keys, status, duração, slug).
- [x] Error Catalog cobre os caminhos de erro dos contratos (`VIDEO_*`).
- [x] Authorization Matrix define dono-do-canal para operações de escrita.
- [x] Events/Messages define producer, consumer, idempotência (`jobId=videoId`), retry e backoff.
- [x] Dependency Map sem ciclos; SIs ordenados e sem dependência para frente.
- [x] Libs novas fixadas em `library-refs.md` nas versões instaladas.
- [x] Reuso de padrões das Fases 01–02 explícito (config `registerAs`, `DomainException`, guard JWT).
- [x] Capability Coverage mapeia os 9 bullets da Fase 03 do `docs/project-plan.md` a pelo menos um TD.

## Veredito

**Status: clean.** Plano consistente, decisões completas e pronto para implementação.
