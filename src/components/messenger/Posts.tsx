"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, ImagePlus, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { COMMENT_MAX, POST_TEXT_MAX } from "@/lib/messenger/posts";
import { mApi, mUpload, MApiError } from "./api";
import { Avatar, Sheet, Spinner } from "./ui";
import { fmtCount } from "./ProfileHeader";

type Author = { uid: string; displayName: string; handle: string; photoURL: string | null; verified?: boolean };
type Post = { id: string; uid: string; text: string; imageUrl?: string; createdAt: number; likes: number; comments: number; liked: boolean };
type Comment = { id: string; uid: string; text: string; createdAt: number; author: { displayName: string; handle: string; photoURL: string | null } | null };

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Вкладка «Посты» в профиле: лента публикаций человека. На своём профиле сверху форма нового поста. */
export function PostsTab({ uid, mine, canModerate }: { uid: string; mine: boolean; canModerate?: boolean }) {
  const { toast } = useToast();
  const [author, setAuthor] = useState<Author | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openComments, setOpenComments] = useState<Post | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    mApi<{ author: Author; posts: Post[] }>(`posts?uid=${encodeURIComponent(uid)}`).then((d) => { setAuthor(d.author); setPosts(d.posts); }).catch(() => setPosts([]));
  }, [uid]);
  useEffect(() => { setPosts(null); load(); }, [load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const publish = async () => {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    try {
      let imageUrl: string | undefined;
      if (file) imageUrl = (await mUpload(file, "image")).url;
      await mApi("posts", { action: "create", text, imageUrl });
      setText(""); pick(null);
      toast("success", "Пост опубликован");
      load();
    } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось опубликовать"); } finally { setBusy(false); }
  };

  const like = async (p: Post) => {
    const next = !p.liked;
    setPosts((l) => l && l.map((x) => (x.id === p.id ? { ...x, liked: next, likes: Math.max(0, x.likes + (next ? 1 : -1)) } : x)));
    try { await mApi("posts", { action: next ? "like" : "unlike", id: p.id }); } catch { load(); }
  };
  const del = async (p: Post) => {
    if (!confirm("Удалить пост?")) return;
    try { await mApi("posts", { action: "delete", id: p.id }); setPosts((l) => l && l.filter((x) => x.id !== p.id)); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось удалить"); }
  };

  return (
    <div className="px-4 pb-6 flex flex-col gap-3">
      {mine && (
        <div className="rounded-[22px] p-3" style={{ background: "var(--mx-surface)" }}>
          <textarea className="w-full bg-transparent outline-none resize-none text-[16px] min-h-[64px]" placeholder="Что нового?" maxLength={POST_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
          {preview && (
            <div className="relative mt-1 mb-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="max-h-40 rounded-2xl" />
              <button onClick={() => pick(null)} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }} aria-label="Убрать фото"><X size={15} /></button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button onClick={() => fileRef.current?.click()} className="w-9 h-9 flex items-center justify-center mx-muted" aria-label="Добавить фото"><ImagePlus size={21} /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            <button onClick={publish} disabled={busy || (!text.trim() && !file)} className="h-9 px-5 rounded-full font-semibold text-[14.5px] disabled:opacity-40" style={{ background: "var(--mx-accent)", color: "#fff" }}>{busy ? <Spinner size={16} /> : "Опубликовать"}</button>
          </div>
        </div>
      )}

      {posts === null ? <div className="flex justify-center py-8"><Spinner /></div> : posts.length === 0 ? (
        <p className="mx-muted text-center text-[14.5px] py-8 px-6">{mine ? "Постов пока нет. Напиши первый." : "Постов пока нет"}</p>
      ) : posts.map((p) => (
        <div key={p.id} className="rounded-[22px] p-3.5" style={{ background: "var(--mx-surface)" }}>
          <div className="flex items-center gap-2.5">
            <Avatar src={author?.photoURL ?? null} name={author?.displayName ?? ""} seed={uid} size={38} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-bold text-[15px] truncate">{author?.displayName}</p>
              <p className="text-[13px] mx-muted truncate">@{author?.handle} · {fmtDate(p.createdAt)}</p>
            </div>
            {(mine || canModerate) && <button onClick={() => del(p)} className="w-8 h-8 flex items-center justify-center mx-muted" aria-label="Удалить"><Trash2 size={16} /></button>}
          </div>
          {p.text && <p className="text-[16px] mt-2.5 whitespace-pre-wrap break-words">{p.text}</p>}
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="mt-2.5 w-full rounded-[18px] object-cover" style={{ maxHeight: 420 }} loading="lazy" draggable={false} />
          )}
          <div className="flex items-center gap-5 mt-3">
            <button onClick={() => like(p)} className="flex items-center gap-1.5 text-[14px]" style={{ color: p.liked ? "#ff3b6b" : "var(--mx-muted)" }}><Heart size={19} fill={p.liked ? "currentColor" : "none"} />{p.likes > 0 ? fmtCount(p.likes) : ""}</button>
            <button onClick={() => setOpenComments(p)} className="flex items-center gap-1.5 text-[14px] mx-muted"><MessageCircle size={19} />{p.comments > 0 ? fmtCount(p.comments) : ""}</button>
          </div>
        </div>
      ))}

      <CommentsSheet post={openComments} onClose={() => setOpenComments(null)} onAdded={() => { load(); }} />
    </div>
  );
}

function CommentsSheet({ post, onClose, onAdded }: { post: Post | null; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!post) return;
    mApi<{ comments: Comment[] }>(`posts?comments=${encodeURIComponent(post.id)}`).then((d) => setList(d.comments)).catch(() => setList([]));
  }, [post]);
  useEffect(() => { setList(null); setText(""); load(); }, [load]);
  const send = async () => {
    if (!post || busy || !text.trim()) return;
    setBusy(true);
    try { await mApi("posts", { action: "comment", id: post.id, text }); setText(""); load(); onAdded(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось отправить"); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!post} onClose={onClose} title="Комментарии" full zIndex={80}>
      <div className="flex flex-col" style={{ minHeight: "60vh" }}>
        <div className="flex-1 px-4 pb-3">
          {list === null ? <div className="flex justify-center py-8"><Spinner /></div> : list.length === 0 ? <p className="mx-muted text-center py-10 text-[14.5px]">Комментариев пока нет</p> : list.map((c) => (
            <div key={c.id} className="flex gap-2.5 py-2">
              <Avatar src={c.author?.photoURL ?? null} name={c.author?.displayName ?? "?"} seed={c.uid} size={34} />
              <div className="min-w-0 flex-1"><p className="text-[13px]"><b>{c.author?.displayName ?? "Удалён"}</b> <span className="mx-muted">· {fmtDate(c.createdAt)}</span></p><p className="text-[15.5px] whitespace-pre-wrap break-words">{c.text}</p></div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--mx-line)" }}>
          <input className="mx-input flex-1" placeholder="Написать комментарий" maxLength={COMMENT_MAX} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button onClick={send} disabled={busy || !text.trim()} className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40" style={{ background: "var(--mx-accent)", color: "#fff" }} aria-label="Отправить"><Send size={17} /></button>
        </div>
      </div>
    </Sheet>
  );
}
