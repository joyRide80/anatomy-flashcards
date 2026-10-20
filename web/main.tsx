import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import "../app/globals.css";

const root = document.getElementById("root")!;
const path = location.pathname;

if (import.meta.env.DEV && path.startsWith("/render-cards")) {
  import("../app/cards/card-renderer").then((m) => m.startCardRenderer(root));
} else {
  const Page = lazy(() =>
    path.startsWith("/atlas")
      ? import("../app/page")
      : import("../app/study/page"),
  );
  createRoot(root).render(
    <Suspense fallback={null}>
      <Page />
    </Suspense>,
  );
}
