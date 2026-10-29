import MessengerPage from "@/components/messenger/MessengerPage";

/** Адрес установленного приложения (start_url манифеста): внутри области /m/, поэтому с главного экрана открывается ТОЛЬКО мессенджер. */
export default function Page() {
  return <MessengerPage />;
}
