import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, type Checklist, type ChecklistItem } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconX } from "./icons";
import { QuickBadge } from "./QuickBadge";

const card =
  "bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)]";
const inputCls =
  "border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 transition";

type ToDelete =
  | { kind: "list"; list: Checklist }
  | { kind: "item"; item: ChecklistItem }
  | { kind: "done"; list: Checklist; items: ChecklistItem[] };

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked ? "bg-electric-cyan border-electric-cyan text-night-blue" : "border-white/30 hover:border-electric-cyan/70"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )}
    </button>
  );
}

function ListCard({
  list,
  items,
  open,
  onToggleOpen,
  onAsk,
}: {
  list: Checklist;
  items: ChecklistItem[];
  open: boolean;
  onToggleOpen: () => void;
  onAsk: (d: ToDelete) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addItem = useMutation({
    mutationFn: (t: string) => api.createChecklistItem(list.id, t),
    onSuccess: () => {
      setText("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["checklist-items"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo agregar"),
  });

  // Marcar es instantáneo: se actualiza la caché al toque y se revierte si el servidor falla.
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.setChecklistItemDone(id, done),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ["checklist-items"] });
      const prev = qc.getQueryData<ChecklistItem[]>(["checklist-items"]);
      qc.setQueryData<ChecklistItem[]>(["checklist-items"], (old) => old?.map((i) => (i.id === id ? { ...i, done } : i)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["checklist-items"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["checklist-items"] }),
  });

  const ordered = useMemo(() => [...items].sort((a, b) => Number(a.done) - Number(b.done)), [items]);
  const done = items.filter((i) => i.done);

  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex items-center gap-2 px-5 py-4 hover:bg-white/5 transition-colors group">
        <button type="button" onClick={onToggleOpen} className="flex-1 min-w-0 text-left" aria-expanded={open}>
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-white/90 truncate">{list.title}</p>
            {list.created_by === "agent" && <QuickBadge iconOnly />}
          </div>
          <p className="text-[11px] text-white/40 mt-0.5">
            {items.length === 0 ? "Vacía" : `${done.length} de ${items.length} marcados`}
          </p>
        </button>
        <button
          type="button"
          onClick={() => onAsk({ kind: "list", list })}
          aria-label={`Borrar la lista ${list.title}`}
          className="text-white/20 hover:text-red-400 transition-colors p-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <IconX className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      {items.length > 0 && (
        <div className="h-1 bg-white/5">
          <div className="h-full bg-electric-cyan/70 transition-all" style={{ width: `${(done.length / items.length) * 100}%` }} />
        </div>
      )}

      {open && (
        <div className="px-5 py-4 space-y-3 border-t border-white/8">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = text.trim();
              if (t) addItem.mutate(t);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Agregar un ítem y Enter…"
              maxLength={300}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <button
              type="submit"
              disabled={addItem.isPending || !text.trim()}
              className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
            >
              Agregar
            </button>
          </form>
          {error && <p className="text-sm text-red-400">{error}</p>}

          {ordered.length > 0 && (
            <ul>
              {ordered.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2 border-t border-white/8 first:border-t-0 group/item">
                  <Check
                    checked={item.done}
                    label={`${item.done ? "Desmarcar" : "Marcar"} ${item.text}`}
                    onChange={() => toggle.mutate({ id: item.id, done: !item.done })}
                  />
                  <span className={`flex-1 min-w-0 break-words text-sm ${item.done ? "line-through text-white/30" : "text-white/85"}`}>
                    {item.text}
                  </span>
                  {item.created_by === "agent" && <QuickBadge iconOnly />}
                  <button
                    type="button"
                    onClick={() => onAsk({ kind: "item", item })}
                    aria-label={`Quitar ${item.text}`}
                    className="text-white/20 hover:text-red-400 transition-colors p-1 flex-shrink-0 sm:opacity-0 sm:group-hover/item:opacity-100"
                  >
                    <IconX className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <button
              type="button"
              onClick={() => onAsk({ kind: "done", list, items: done })}
              className="text-xs font-semibold text-white/50 hover:text-red-300 transition-colors"
            >
              Quitar los {done.length} marcados
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ChecklistsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ToDelete | null>(null);

  const { data: lists, isLoading } = useQuery({ queryKey: ["checklists"], queryFn: api.listChecklists });
  const { data: items } = useQuery({ queryKey: ["checklist-items"], queryFn: api.listChecklistItems });

  const itemsByList = useMemo(() => {
    const map = new Map<string, ChecklistItem[]>();
    for (const i of items ?? []) map.set(i.checklist_id, [...(map.get(i.checklist_id) ?? []), i]);
    return map;
  }, [items]);

  const createList = useMutation({
    mutationFn: api.createChecklist,
    onSuccess: (created) => {
      setTitle("");
      setError(null);
      setOpenId(created.id);
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear la lista"),
  });

  const confirmDelete = useMutation({
    mutationFn: async (d: ToDelete) => {
      if (d.kind === "list") await api.deleteChecklist(d.list.id);
      else if (d.kind === "item") await api.deleteChecklistItem(d.item.id);
      else await Promise.all(d.items.map((i) => api.deleteChecklistItem(i.id)));
    },
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["checklists"] });
      qc.invalidateQueries({ queryKey: ["checklist-items"] });
    },
  });

  const message = (d: ToDelete) =>
    d.kind === "list"
      ? `¿Borrar la lista "${d.list.title}" con todos sus ítems?`
      : d.kind === "item"
        ? `¿Quitar "${d.item.text}" de la lista?`
        : `¿Quitar los ${d.items.length} ítems marcados de "${d.list.title}"?`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Listas</h1>
        <p className="text-sm text-white/40">
          Listas con ítems que se marcan — compras, pendientes del viaje… Quicks también las puede armar y marcar por vos
        </p>
      </div>

      <div className={`${card} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Nueva lista</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = title.trim();
            if (!t) return setError("Poné un nombre para la lista.");
            createList.mutate(t);
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Lista de compras"
            maxLength={120}
            className={`${inputCls} flex-1 min-w-0`}
          />
          <button
            type="submit"
            disabled={createList.isPending}
            className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-4 py-2 disabled:opacity-50 hover:brightness-110 transition"
          >
            Crear
          </button>
        </form>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
      {lists && lists.length === 0 && !isLoading && <p className="text-white/40 text-sm">No hay listas todavía.</p>}

      <div className="space-y-3">
        {(lists ?? []).map((list) => (
          <ListCard
            key={list.id}
            list={list}
            items={itemsByList.get(list.id) ?? []}
            open={openId === list.id}
            onToggleOpen={() => setOpenId(openId === list.id ? null : list.id)}
            onAsk={setToDelete}
          />
        ))}
      </div>

      {toDelete && (
        <ConfirmDialog
          message={message(toDelete)}
          pending={confirmDelete.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => confirmDelete.mutate(toDelete)}
        />
      )}
    </div>
  );
}
