import { redirect } from "next/navigation";

// Старая нерабочая заглушка (без фото, без сохранения заявки) заменена на настоящую форму
// продажи с загрузкой фото — она живёт на /profile/sell. Отправляем сюда всех, кто зашёл
// по старой ссылке (закладка, старая реклама и т.п.), чтобы ничего не сломалось.
export default function SellRedirectPage() {
  redirect("/profile/sell");
}
