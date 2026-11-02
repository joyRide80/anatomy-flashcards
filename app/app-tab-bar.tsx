import { useEffect, useState } from "react";
import { BookOpen, ChartLine, Compass } from "lucide-react";
import { t, type StudyLanguage } from "./study/language";

export type AppTab = "flashcards" | "explore" | "progress";

const savedLanguage = (): StudyLanguage => {
  const language = window.localStorage.getItem("human-atlas:study-language");
  return language === "nb" || language === "da" ? language : "en";
};

export function AppTabBar({
  active,
  language: suppliedLanguage,
}: {
  active: AppTab;
  language?: StudyLanguage;
}) {
  const [storedLanguage, setStoredLanguage] = useState<StudyLanguage>("en");
  useEffect(() => {
    setStoredLanguage(savedLanguage());
  }, []);
  const language = suppliedLanguage ?? storedLanguage;
  const tabs: { id: AppTab; href: string; icon: typeof BookOpen; label: string }[] = [
    { id: "flashcards", href: "/study", icon: BookOpen, label: t(language, "flashcards") },
    { id: "explore", href: "/atlas", icon: Compass, label: t(language, "explore") },
    { id: "progress", href: "/study?tab=mine", icon: ChartLine, label: t(language, "progress") },
  ];

  return (
    <nav className="app-tab-bar" aria-label={t(language, "primaryNavigation")}>
      {tabs.map(({ id, href, icon: Icon, label }) => (
        <a key={id} href={href} aria-current={active === id ? "page" : undefined}>
          <Icon size={21} strokeWidth={active === id ? 2.4 : 1.8} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
