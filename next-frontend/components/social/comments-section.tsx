"use client"

import * as React from "react"
import Link from "next/link"

import { ReactionBar } from "@/components/social/reaction-bar"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/use-session"
import type { CommentItem, PaginatedComments } from "@/lib/api/contracts"
import { readApiError } from "@/lib/videos/errors"
import { formatRelative } from "@/lib/videos/format"

const MAX_BODY = 2000

function CommentForm({
  placeholder,
  onSubmit,
  submitLabel = "Comentar",
  onCancel,
}: {
  placeholder: string
  onSubmit: (body: string) => Promise<string | null>
  submitLabel?: string
  onCancel?: () => void
}) {
  const [body, setBody] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return setError("Escreva algo antes de enviar.")
    if (text.length > MAX_BODY) return setError(`No máximo ${MAX_BODY} caracteres.`)
    setPending(true)
    setError(null)
    const err = await onSubmit(text)
    if (err) setError(err)
    else setBody("")
    setPending(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" data-slot="comment-form">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-label={placeholder}
        className="rounded-[var(--radius-2)] border border-input bg-transparent px-3 py-2 text-body-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enviando…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  )
}

function CommentView({
  comment,
  onReply,
  onDelete,
  canReply,
}: {
  comment: CommentItem
  onReply?: (body: string) => Promise<string | null>
  onDelete: (id: string) => Promise<void>
  canReply: boolean
}) {
  const [replying, setReplying] = React.useState(false)
  return (
    <div data-slot="comment" data-deleted={comment.deleted} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-caption text-muted-foreground">
        {comment.author ? (
          <Link href={`/c/${comment.author.nickname}`} className="text-label-md text-foreground hover:underline">
            {comment.author.name}
          </Link>
        ) : (
          <span className="text-label-md">[excluído]</span>
        )}
        <span>{formatRelative(comment.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-body-md text-foreground">
        {comment.deleted ? <em className="text-muted-foreground">Comentário excluído.</em> : comment.body}
      </p>
      {!comment.deleted && (
        <div className="flex flex-wrap items-center gap-3">
          <ReactionBar endpoint={`/api/comments/${comment.id}/reaction`} initial={comment.reactions} compact />
          {canReply && onReply && (
            <Button type="button" variant="link" size="sm" onClick={() => setReplying((v) => !v)}>
              Responder
            </Button>
          )}
          {comment.mine && (
            <Button type="button" variant="link" size="sm" onClick={() => onDelete(comment.id)} data-slot="delete-comment">
              Excluir
            </Button>
          )}
        </div>
      )}
      {replying && onReply && (
        <CommentForm
          placeholder="Escreva uma resposta"
          submitLabel="Responder"
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            const err = await onReply(body)
            if (!err) setReplying(false)
            return err
          }}
        />
      )}
    </div>
  )
}

/** Comentários do vídeo: lista (raízes + respostas), formulário, resposta e exclusão pelo autor. */
function CommentsSection({ videoId, initial }: { videoId: string; initial: PaginatedComments }) {
  const session = useSession()
  const [page, setPage] = React.useState(initial)

  async function reload() {
    const res = await fetch(`/api/videos/${videoId}/comments?page=1&limit=${initial.limit}`)
    if (res.ok) setPage((await res.json()) as PaginatedComments)
  }

  async function create(body: string): Promise<string | null> {
    const res = await fetch(`/api/videos/${videoId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) return readApiError(res, "Não foi possível comentar")
    await reload()
    return null
  }

  async function reply(parentId: string, body: string): Promise<string | null> {
    const res = await fetch(`/api/comments/${parentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) return readApiError(res, "Não foi possível responder")
    await reload()
    return null
  }

  async function remove(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" })
    if (res.ok) await reload()
  }

  return (
    <section data-slot="comments-section" className="flex flex-col gap-4">
      <h2 className="text-h3 text-foreground">
        {page.commentsCount} comentário{page.commentsCount === 1 ? "" : "s"}
      </h2>
      {session.isLoggedIn ? (
        <CommentForm placeholder="Adicione um comentário" onSubmit={create} />
      ) : (
        <p className="text-body-md text-muted-foreground" data-slot="comments-login-cta">
          <Link href="/login" className="text-link hover:underline">
            Entre
          </Link>{" "}
          para comentar.
        </p>
      )}
      <ul className="flex flex-col gap-5">
        {page.items.map((root) => (
          <li key={root.id} data-slot="comment-thread" className="flex flex-col gap-3">
            <CommentView
              comment={root}
              canReply={session.isLoggedIn}
              onReply={(body) => reply(root.id, body)}
              onDelete={remove}
            />
            {root.replies && root.replies.length > 0 && (
              <ul className="ml-6 flex flex-col gap-3 border-l border-border pl-4">
                {root.replies.map((child) => (
                  <li key={child.id}>
                    <CommentView comment={child} canReply={false} onDelete={remove} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export { CommentsSection }
