import { redirect } from "next/navigation";

// Старый адрес входа: теперь вход и регистрация показываются прямо на /m.
export default function MessengerStartRedirect() {
  redirect("/m");
}
