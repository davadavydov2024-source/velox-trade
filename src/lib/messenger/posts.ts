/** Посты в профиле: короткие публикации (текст + фото) с лайками и комментариями, как лента в соцсети. */
export type MessengerPost = {
  id: string;
  uid: string;
  text: string;
  imageUrl?: string;
  createdAt: number;
  likes: number;
  comments: number;
};
export const POST_TEXT_MAX = 1000;
export const COMMENT_MAX = 300;
