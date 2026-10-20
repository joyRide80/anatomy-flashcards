import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  buildLatinIndex,
  parseUpload,
  type MatchResult,
  type MatchStatus,
} from "@/lib/flashcards/latin";
import type { Catalog, Category, DeckItem } from "@/lib/flashcards/types";
import {
  CATEGORY_LABEL,
  Thumb,
  capitalize,
  catalogMaps,
  latinName,
} from "./shared";

interface Row extends MatchResult {
  key: number;
  /** "structure:id", "group:id", or "" to skip. */
  choice: string;
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  exact: "Matched",
  group: "Group",
  suggested: "Check",
  ambiguous: "Choose",
  none: "Not found",
};

const EXAMPLE = `M. biceps brachii; two-headed arm flexor
Musculus deltoideus
Os scaphoideum
Lig. plantare longum
Costae`;

export function CreateDeck({
  catalog,
  onCancel,
  onCreate,
}: {
  catalog: Catalog;
  onCancel: () => void;
  onCreate: (name: string, items: DeckItem[]) => Promise<void>;
}) {
  const maps = useMemo(() => catalogMaps(catalog), [catalog]);
  const index = useMemo(() => buildLatinIndex(catalog), [catalog]);
  const byCategory = useMemo(() => {
    const out: Record<Category, typeof catalog.structures> = {
      bone: [],
      muscle: [],
      ligament: [],
    };
    for (const s of catalog.structures) out[s.category].push(s);
    for (const list of Object.values(out))
      list.sort((a, b) => latinName(a).localeCompare(latinName(b)));
    return out;
  }, [catalog]);

  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [csv, setCsv] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const match = () => {
    const lines = parseUpload(text, csv);
    if (!lines.length) {
      setError("Add at least one Latin term, one per line.");
      return;
    }
    setError("");
    setRows(
      lines.map((line, key) => {
        const result = index.match(line.term, line.note);
        const top = result.candidates[0];
        const choice =
          top && result.status !== "none" ? `${top.type}:${top.id}` : "";
        return { ...result, key, choice };
      }),
    );
  };

  const readFile = async (f: File) => {
    setText(await f.text());
    setCsv(/\.csv$/i.test(f.name));
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const items = useMemo(() => {
    const out: DeckItem[] = [];
    const seen = new Set<string>();
    const push = (item: DeckItem) => {
      if (seen.has(item.structureId)) return;
      seen.add(item.structureId);
      out.push(item);
    };
    for (const row of rows ?? []) {
      const [type, id] = row.choice.split(":");
      if (type === "structure")
        push({
          structureId: id,
          label: row.input,
          ...(row.note ? { note: row.note } : {}),
        });
      if (type === "group")
        for (const m of maps.groups.get(id)?.members ?? []) {
          const s = maps.structures.get(m);
          if (s)
            push({
              structureId: m,
              label: latinName(s),
              note: [row.input, row.note].filter(Boolean).join(" · "),
            });
        }
    }
    return out;
  }, [rows, maps]);

  const tally = (rows ?? []).reduce(
    (n, r) => ({ ...n, [r.status]: (n[r.status] ?? 0) + 1 }),
    {} as Partial<Record<MatchStatus, number>>,
  );
  const unresolved = (rows ?? []).filter(
    (r) => (r.status === "ambiguous" || r.status === "suggested") && r.choice,
  ).length;

  const create = async () => {
    setSaving(true);
    try {
      await onCreate(name.trim() || "My Latin deck", items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The deck could not be saved.");
      setSaving(false);
    }
  };

  const setChoice = (key: number, choice: string) =>
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, choice } : r)));

  return (
    <div className="create">
      <header className="session-bar">
        <button
          type="button"
          className="back"
          onClick={rows ? () => setRows(null) : onCancel}
        >
          <ArrowLeft size={16} /> {rows ? "Edit list" : "Decks"}
        </button>
        <h2>{rows ? "Check the matches" : "New deck from your Latin list"}</h2>
      </header>

      {!rows ? (
        <section className="create-input">
          <label className="field">
            <span>Deck name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Upper limb — week 3"
            />
          </label>
          <label className="field">
            <span>Latin terms, one per line</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={12}
              spellCheck={false}
            />
          </label>
          <p className="hint">
            Add your own note after a semicolon, tab, or “|”. Abbreviations such
            as <i>m.</i> and <i>lig.</i>, side words like <i>dexter</i>, and
            spelling variants are recognised. Collective terms such as{" "}
            <i>Costae</i> or <i>Ossa carpi</i> expand to every member.
          </p>
          <div className="create-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => file.current?.click()}
            >
              <Upload size={16} /> Upload .txt or .csv
            </button>
            <input
              ref={file}
              type="file"
              accept=".txt,.csv,.tsv,text/plain,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="action"
              onClick={match}
              disabled={!text.trim()}
            >
              Match terms
            </button>
          </div>
          {error && (
            <p className="study-error" role="alert">
              {error}
            </p>
          )}
        </section>
      ) : (
        <section className="review">
          <p className="review-summary">
            {(
              [
                "exact",
                "group",
                "suggested",
                "ambiguous",
                "none",
              ] as MatchStatus[]
            )
              .filter((s) => tally[s])
              .map((s) => (
                <span key={s} className={`status status-${s}`}>
                  {tally[s]} {STATUS_LABEL[s].toLowerCase()}
                </span>
              ))}
          </p>
          {unresolved > 0 && (
            <p className="hint">
              Rows marked <b>Check</b> or <b>Choose</b> were matched by
              similarity. Confirm the structure before creating the deck.
            </p>
          )}
          <ol className="review-list">
            {rows.map((row) => {
              const [type, id] = row.choice.split(":");
              const structure =
                type === "structure" ? maps.structures.get(id) : undefined;
              const group = type === "group" ? maps.groups.get(id) : undefined;
              return (
                <li key={row.key} className={`review-row is-${row.status}`}>
                  <div className="review-term">
                    <span className={`status status-${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="term">{row.input}</span>
                    {row.note && <span className="row-note">{row.note}</span>}
                  </div>
                  <div className="review-match">
                    {structure ? (
                      <>
                        <Thumb structure={structure} />
                        <span className="match-name">
                          <i>{latinName(structure)}</i>
                          <small>
                            {capitalize(structure.en)} ·{" "}
                            {CATEGORY_LABEL[structure.category]}
                          </small>
                        </span>
                      </>
                    ) : group ? (
                      <span className="match-name">
                        <i>{group.la[0]}</i>
                        <small>Adds {group.members.length} cards</small>
                      </span>
                    ) : (
                      <span className="match-name muted">
                        {row.status === "none"
                          ? "Not in the 3D model — pick one or skip"
                          : "Skipped"}
                      </span>
                    )}
                    <NativeSelect
                      size="sm"
                      className="match-select"
                      value={row.choice}
                      aria-label={`Structure for ${row.input}`}
                      onChange={(e) => setChoice(row.key, e.target.value)}
                    >
                      <NativeSelectOption value="">
                        Skip this term
                      </NativeSelectOption>
                      {row.candidates.length > 0 && (
                        <NativeSelectOptGroup label="Best matches">
                          {row.candidates.map((c) => {
                            const label =
                              c.type === "group"
                                ? `${maps.groups.get(c.id)?.la[0]} (group)`
                                : latinName(maps.structures.get(c.id)!);
                            return (
                              <NativeSelectOption
                                key={`${c.type}:${c.id}`}
                                value={`${c.type}:${c.id}`}
                              >
                                {label}
                              </NativeSelectOption>
                            );
                          })}
                        </NativeSelectOptGroup>
                      )}
                      {(Object.keys(byCategory) as Category[]).map((cat) => (
                        <NativeSelectOptGroup
                          key={cat}
                          label={`All ${CATEGORY_LABEL[cat].toLowerCase()}s`}
                        >
                          {byCategory[cat].map((s) => (
                            <NativeSelectOption
                              key={s.id}
                              value={`structure:${s.id}`}
                            >
                              {latinName(s)} — {s.en}
                            </NativeSelectOption>
                          ))}
                        </NativeSelectOptGroup>
                      ))}
                    </NativeSelect>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="create-actions sticky">
            <label className="field inline">
              <span>Deck name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Latin deck"
              />
            </label>
            <button
              type="button"
              className="action"
              disabled={!items.length || saving}
              onClick={create}
            >
              Create deck · {items.length}{" "}
              {items.length === 1 ? "card" : "cards"}
            </button>
          </div>
          {error && (
            <p className="study-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
