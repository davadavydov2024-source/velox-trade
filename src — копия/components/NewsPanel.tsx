"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Megaphone, ExternalLink } from "lucide-react";
import { getNewsPosts } from "@/lib/newsChannel";
import { NewsPost } from "@/types";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";

/** Read-only лента канала «Velox Trade Новости» — админ постит, все остальные читают. */
export function NewsPanel() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNewsPosts()
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Megaphone size={20} className="text-accent" />
        <div>
          <p className="font-bold">Velox Trade Новости</p>
          <p className="text-xs text-white/40">Официальный канал — обновления, акции и объявления</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-center text-white/40 text-sm">Загрузка...</div>
      ) : posts.length === 0 ? (
        <div className="card p-8 text-center text-white/40 text-sm">Пока нет новостей. Загляните позже!</div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="card p-4">
              {isValidImageSrc(post.image) && (
                <div className="relative w-full h-48 rounded-btn overflow-hidden bg-black/30 mb-3">
                  <Image src={safeImageSrc(post.image)} alt="" fill className="object-cover" sizes="480px" />
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap text-white/85">{post.text}</p>
              {post.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {post.buttons.map((b, i) => (
                    <a
                      key={i}
                      href={b.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                    >
                      {b.text} <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-white/30 mt-3">{new Date(post.createdAt).toLocaleString("ru-RU")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
