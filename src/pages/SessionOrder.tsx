import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../lib/utils";
import { getOrCreateBrowserUserId } from "../lib/browserUserId";

const STORAGE_KEY_PREFIX = "georgy_session_name:";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getStoredName(sessionId: string): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + sessionId);
  } catch {
    return null;
  }
}

function setStoredName(sessionId: string, name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + sessionId, name.trim());
  } catch {
    // ignore
  }
}

export default function SessionOrder() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = useQuery(
    api.sessions.getSession,
    sessionId ? { sessionId: sessionId as Id<"sessions"> } : "skip",
  );
  const orders = useQuery(
    api.sessions.listOrders,
    sessionId ? { sessionId: sessionId as Id<"sessions"> } : "skip",
  );
  const summaryText = useQuery(
    api.sessions.getSummaryText,
    sessionId
      ? {
          sessionId: sessionId as Id<"sessions">,
          restaurantName: session?.restaurantName,
          deliveryTime: session?.deliveryTime,
        }
      : "skip",
  );
  const addOrder = useMutation(api.sessions.addOrder);
  const updateOrder = useMutation(api.sessions.updateOrder);
  const deleteOrder = useMutation(api.sessions.deleteOrder);
  const setSessionLocked = useMutation(api.sessions.setSessionLocked);

  const [name, setName] = useState(() =>
    sessionId ? (getStoredName(sessionId) ?? "") : "",
  );
  const [confirmedName, setConfirmedName] = useState<string | null>(() =>
    sessionId ? getStoredName(sessionId) : null,
  );
  const [sopa, setSopa] = useState("");
  const [carne, setCarne] = useState("");
  const [carne2, setCarne2] = useState("");
  const [complements, setComplements] = useState<string[]>([]);
  const [complementFreeText, setComplementFreeText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySummaryStatus, setCopySummaryStatus] = useState<
    "idle" | "ok" | "fail"
  >("idle");
  const [copyLinkStatus, setCopyLinkStatus] = useState<"idle" | "ok" | "fail">(
    "idle",
  );
  const [lockToggling, setLockToggling] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<Id<"orders"> | null>(null);
  const [useManualMode, setUseManualMode] = useState(false);
  const [editForm, setEditForm] = useState<{
    personName: string;
    sopa: string;
    carne: string;
    carne2: string;
    complements: string[];
    notes: string;
  }>({ personName: "", sopa: "", carne: "", carne2: "", complements: [], notes: "" });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session?.expiresAt || session.locked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.expiresAt, session?.locked]);

  const menu = session?.menu;
  const browserUserId = getOrCreateBrowserUserId();
  const isSessionOwner =
    Boolean(session?.ownerId) && session?.ownerId === browserUserId;
  const hasMenu = Boolean(
    menu && (menu.sopas.length > 0 || menu.carnes.length > 0 || menu.complementos.length > 0),
  );
  const storedName = sessionId ? getStoredName(sessionId) : null;
  const nameForStep = confirmedName ?? storedName;
  const orderFromMe =
    orders && nameForStep
      ? orders.find(
          (o) => o.personName.toLowerCase() === nameForStep.toLowerCase(),
        )
      : null;
  const alreadyOrdered = Boolean(orderFromMe);

  function canEditOrder(order: {
    _id: Id<"orders">;
    clientId?: string;
  }): boolean {
    if (isLocked) return false;
    if (isSessionOwner) return true;
    return (
      order.clientId != null && order.clientId === browserUserId
    );
  }

  function openEditOrder(order: {
    _id: Id<"orders">;
    personName: string;
    sopa?: string;
    carne?: string;
    carne2?: string;
    complements: string[];
    notes?: string;
  }) {
    setEditingOrderId(order._id);
    setEditForm({
      personName: order.personName,
      sopa: order.sopa ?? "",
      carne: order.carne ?? "",
      carne2: order.carne2 ?? "",
      complements: [...order.complements],
      notes: order.notes ?? "",
    });
    setEditError(null);
  }

  function handleDeleteOrder(orderId: Id<"orders">) {
    if (!sessionId) return;
    if (!window.confirm("¿Seguro que quieres eliminar este pedido?")) return;
    deleteOrder({
      orderId,
      sessionId: sessionId as Id<"sessions">,
      clientId: browserUserId || undefined,
    }).catch((err) => {
      // Surface a simple error message if deletion fails
      alert(
        err instanceof Error
          ? err.message
          : "Error al eliminar el pedido",
      );
    });
  }

  function handleEditOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || editingOrderId == null) return;
    setEditError(null);
    setEditSubmitting(true);
    const { personName, sopa, carne, carne2, complements, notes } = editForm;
    const sopaValue = sopa.trim();
    const carneValue = carne.trim();
    const carne2Value = carne2.trim();
    if (!sopaValue && !carneValue) {
      setEditError("Elige una sopa o una carne.");
      setEditSubmitting(false);
      return;
    }
    if (!sopaValue && hasMenu && complements.length === 0) {
      setEditError("Elige al menos un complemento (máx. 3).");
      setEditSubmitting(false);
      return;
    }
    updateOrder({
      orderId: editingOrderId,
      sessionId: sessionId as Id<"sessions">,
      personName: personName.trim(),
      sopa: sopaValue || undefined,
      carne: sopaValue ? undefined : carneValue || undefined,
      carne2: sopaValue ? undefined : carne2Value || undefined,
      complements: sopaValue ? [] : complements,
      notes: notes.trim() || undefined,
      clientId: browserUserId || undefined,
    })
      .then(() => {
        setEditingOrderId(null);
      })
      .catch((err) => {
        setEditError(err instanceof Error ? err.message : "Error al guardar");
      })
      .finally(() => setEditSubmitting(false));
  }

  const step = useMemo((): "name" | "form" | "done" => {
    const confirmed = (nameForStep ?? "").trim();
    if (!confirmed) return "name";
    if (
      orders &&
      orders.some(
        (o) => o.personName.toLowerCase() === confirmed.toLowerCase(),
      )
    )
      return "done";
    return "form";
  }, [nameForStep, orders]);

  const shareUrl =
    typeof window !== "undefined" && sessionId
      ? `${window.location.origin}/s/${sessionId}`
      : "";

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t || !sessionId) return;
    setStoredName(sessionId, t);
    setName(t);
    setConfirmedName(t);
  }

  function toggleComplement(item: string) {
    setComplements((prev) =>
      prev.includes(item)
        ? prev.filter((c) => c !== item)
        : prev.length < 3
          ? [...prev, item]
          : prev,
    );
  }

  function handleOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !name.trim()) return;
    setError(null);
    setSubmitting(true);
    let carneValue = carne.trim();
    let carne2Value = carne2.trim();
    let complementsValue = complements;
    const isManual = !hasMenu || (hasMenu && useManualMode);
    if (isManual) {
      carneValue = carne.trim();
      carne2Value = carne2.trim();
      const fromText = complementFreeText
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      complementsValue = fromText;
    }
    const sopaValue = sopa.trim();
    if (!sopaValue && !carneValue) {
      setError("Elige una sopa o una carne.");
      setSubmitting(false);
      return;
    }
    if (!sopaValue && !isManual && complementsValue.length === 0) {
      setError("Elige al menos un complemento (máx. 3).");
      setSubmitting(false);
      return;
    }
    addOrder({
      sessionId: sessionId as Id<"sessions">,
      personName: name.trim(),
      sopa: sopaValue || undefined,
      carne: sopaValue ? undefined : carneValue || undefined,
      carne2: sopaValue ? undefined : carne2Value || undefined,
      complements: sopaValue ? [] : complementsValue,
      notes: notes.trim() || undefined,
      clientId: getOrCreateBrowserUserId() || undefined,
    })
      .then(() => {
        setStoredName(sessionId, name.trim());
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al enviar");
      })
      .finally(() => setSubmitting(false));
  }

  async function handleCopySummary() {
    if (summaryText == null) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopySummaryStatus("ok");
      setTimeout(() => setCopySummaryStatus("idle"), 2000);
    } catch {
      setCopySummaryStatus("fail");
      setTimeout(() => setCopySummaryStatus("idle"), 2000);
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLinkStatus("ok");
      setTimeout(() => setCopyLinkStatus("idle"), 2000);
    } catch {
      setCopyLinkStatus("fail");
      setTimeout(() => setCopyLinkStatus("idle"), 2000);
    }
  }

  async function handleToggleLock() {
    if (!sessionId || session == null) return;
    setLockToggling(true);
    try {
      await setSessionLocked({
        sessionId: sessionId as Id<"sessions">,
        locked: !session.locked,
      });
    } finally {
      setLockToggling(false);
    }
  }

  if (sessionId === undefined) {
    return (
      <div className="min-h-screen bg-background p-4">
        <p className="text-muted-foreground">Sesión no válida.</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="min-h-screen bg-background p-4">
        <p className="text-muted-foreground">Sesión no encontrada.</p>
        <Link
          to="/"
          className="mt-2 inline-block text-sm text-primary underline"
        >
          Crear nueva sesión
        </Link>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-xl space-y-6">
          <header className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 flex-1 min-w-0" />
              <Skeleton className="h-8 w-24" />
            </div>
          </header>
          <Skeleton className="h-24 rounded-lg" />
          <section className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
          </section>
        </div>
      </div>
    );
  }

  const title =
    [session.restaurantName, session.deliveryTime]
      .filter(Boolean)
      .join(" – ") || "Pedido grupal";

  const isLocked = Boolean(session.locked);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {isSessionOwner && (
            <p className="mt-1 text-xs text-muted-foreground">
              Tú creaste este enlace (cualquiera puede bloquear/desbloquear).
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Comparte el enlace:
            </span>
            <input
              type="text"
              readOnly
              value={shareUrl}
              className={cn(
                "flex-1 min-w-0 rounded border border-input bg-muted/50 px-2 py-1 text-xs",
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
            >
              {copyLinkStatus === "ok"
                ? "Copiado"
                : copyLinkStatus === "fail"
                  ? "Error"
                  : "Copiar enlace"}
            </Button>
            {isSessionOwner && (
              <Button
                type="button"
                variant={isLocked ? "default" : "outline"}
                size="sm"
                onClick={handleToggleLock}
                disabled={lockToggling}
              >
                {lockToggling
                  ? "..."
                  : isLocked
                    ? "Desbloquear pedidos"
                    : "Bloquear pedidos"}
              </Button>
            )}
          </div>
        </header>

        {isLocked && (
          <div
            role="status"
            className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
          >
            No se aceptan más pedidos ni modificaciones.
            {isSessionOwner &&
              " Si quieres abrir de nuevo, pulsa «Desbloquear pedidos»."}
          </div>
        )}

        {session.expiresAt && !isLocked && (
          <div
            role="status"
            className="rounded-lg border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400"
          >
            {session.expiresAt - now > 0 ? (
              <>Cierre automático en <span className="font-mono font-medium">{formatCountdown(session.expiresAt - now)}</span></>
            ) : (
              "Cerrando pedidos…"
            )}
          </div>
        )}

        {!isLocked && step === "name" && (
          <form onSubmit={handleNameSubmit} className="space-y-3">
            <label htmlFor="name" className="block text-sm font-medium">
              Tu nombre
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. María"
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring",
              )}
            />
            <Button type="submit">Continuar</Button>
          </form>
        )}

        {isLocked && step !== "done" && (
          <p className="text-sm text-muted-foreground">
            No se aceptan más pedidos ni modificaciones.
          </p>
        )}

        {!isLocked && (step === "form" || (step === "done" && !alreadyOrdered)) &&
          !alreadyOrdered && (
            <form
              onSubmit={handleOrderSubmit}
              className="space-y-4 rounded-lg border border-border bg-card p-4"
            >
              <p className="text-sm font-medium">Pedido de {name}</p>

              {hasMenu && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Modo de pedido:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setUseManualMode((v) => !v)}
                  >
                    {useManualMode ? "Usar menú" : "Escribir manualmente"}
                  </Button>
                </div>
              )}

              {hasMenu && !useManualMode ? (
                <>
                  {menu!.sopas.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        Sopa (opcional)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {menu!.sopas.map((item) => (
                          <label
                            key={item}
                            className={cn(
                              "cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors",
                              sopa === item
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input hover:bg-muted/50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={sopa === item}
                              onChange={() => setSopa((prev) => prev === item ? "" : item)}
                              className="sr-only"
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className={cn(sopa && "pointer-events-none opacity-40")}>
                    <p className="mb-2 text-sm font-medium">
                      Carne (máx. 2)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {menu!.carnes.map((item) => {
                        const selected = carne === item || carne2 === item;
                        const selectedCount =
                          (carne ? 1 : 0) +
                          (carne2 && carne2 !== carne ? 1 : 0);
                        const disabled = !selected && selectedCount >= 2;
                        return (
                          <label
                            key={item}
                            className={cn(
                              "cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors",
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input hover:bg-muted/50",
                              disabled && !selected && "opacity-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const isSelected =
                                  carne === item || carne2 === item;
                                if (isSelected) {
                                  if (carne === item) {
                                    setCarne("");
                                  }
                                  if (carne2 === item) {
                                    setCarne2("");
                                  }
                                  return;
                                }
                                const count =
                                  (carne ? 1 : 0) +
                                  (carne2 && carne2 !== carne ? 1 : 0);
                                if (count >= 2) return;
                                if (!carne) {
                                  setCarne(item);
                                } else if (!carne2 && carne !== item) {
                                  setCarne2(item);
                                }
                              }}
                              disabled={disabled}
                              className="sr-only"
                            />
                            {item}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className={cn(sopa && "pointer-events-none opacity-40")}>
                    <p className="mb-2 text-sm font-medium">
                      Complementos (máx. 3)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {menu!.complementos.map((item) => (
                        <label
                          key={item}
                          className={cn(
                            "cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors",
                            complements.includes(item)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={complements.includes(item)}
                            onChange={() => toggleComplement(item)}
                            disabled={
                              !complements.includes(item) &&
                              complements.length >= 3
                            }
                            className="sr-only"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="carne"
                      className="mb-1 block text-sm font-medium"
                    >
                      Carne
                    </label>
                    <input
                      id="carne"
                      type="text"
                      value={carne}
                      onChange={(e) => setCarne(e.target.value)}
                      placeholder="Ej. Pechugas barbacoa"
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-ring",
                      )}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="carne2"
                      className="mb-1 block text-sm font-medium"
                    >
                      Segunda carne (opcional)
                    </label>
                    <input
                      id="carne2"
                      type="text"
                      value={carne2}
                      onChange={(e) => setCarne2(e.target.value)}
                      placeholder="Ej. Costilla"
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-ring",
                      )}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="complements"
                      className="mb-1 block text-sm font-medium"
                    >
                      Complementos (máx. 3, uno por línea)
                    </label>
                    <textarea
                      id="complements"
                      rows={3}
                      value={complementFreeText}
                      onChange={(e) => setComplementFreeText(e.target.value)}
                      placeholder="Arroz blanco&#10;Papa frita&#10;Ensalada"
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-ring",
                      )}
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="notes"
                  className="mb-1 block text-sm font-medium text-muted-foreground"
                >
                  Notas (opcional)
                </label>
                <input
                  id="notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej. sin tomate ni pepino"
                  className={cn(
                    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                  )}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar pedido"}
              </Button>
            </form>
          )}

        {step === "done" && alreadyOrdered && (
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Ya enviaste tu pedido. Aquí debajo puedes ver el resumen para enviar
            al restaurante.
          </p>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">
            Pedidos ({orders?.length ?? 0})
          </h2>
          {orders && orders.length > 0 ? (
            <ul className="space-y-2">
              {orders.map((order) => (
                <li
                  key={order._id}
                  className="rounded-md border border-border bg-card p-3 text-sm"
                >
                  {editingOrderId === order._id ? (
                    <form
                      onSubmit={handleEditOrderSubmit}
                      className="space-y-4"
                    >
                      <p className="font-medium text-muted-foreground">
                        Editar pedido
                      </p>
                      <div>
                        <label
                          htmlFor="edit-personName"
                          className="mb-1 block text-xs font-medium"
                        >
                          Nombre
                        </label>
                        <input
                          id="edit-personName"
                          type="text"
                          required
                          value={editForm.personName}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              personName: e.target.value,
                            }))
                          }
                          className={cn(
                            "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
                            "focus:outline-none focus:ring-2 focus:ring-ring",
                          )}
                        />
                      </div>
                      {hasMenu ? (
                        <>
                          {menu!.sopas.length > 0 && (
                            <div>
                              <p className="mb-1 text-xs font-medium">
                                Sopa (opcional)
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {menu!.sopas.map((item) => (
                                  <label
                                    key={item}
                                    className={cn(
                                      "cursor-pointer rounded border px-2 py-1 text-xs transition-colors",
                                      editForm.sopa === item
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-input hover:bg-muted/50",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editForm.sopa === item}
                                      onChange={() =>
                                        setEditForm((f) => ({
                                          ...f,
                                          sopa: f.sopa === item ? "" : item,
                                        }))
                                      }
                                      className="sr-only"
                                    />
                                    {item}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className={cn(editForm.sopa && "pointer-events-none opacity-40")}>
                            <p className="mb-1 text-xs font-medium">
                              Carne (máx. 2)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {menu!.carnes.map((item) => {
                                const selected =
                                  editForm.carne === item ||
                                  editForm.carne2 === item;
                                const selectedCount =
                                  (editForm.carne ? 1 : 0) +
                                  (editForm.carne2 &&
                                  editForm.carne2 !== editForm.carne
                                    ? 1
                                    : 0);
                                const disabled = !selected && selectedCount >= 2;
                                return (
                                  <label
                                    key={item}
                                    className={cn(
                                      "cursor-pointer rounded border px-2 py-1 text-xs transition-colors",
                                      selected
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-input hover:bg-muted/50",
                                      disabled && !selected && "opacity-50",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => {
                                        const isSelected =
                                          editForm.carne === item ||
                                          editForm.carne2 === item;
                                        if (isSelected) {
                                          setEditForm((f) => ({
                                            ...f,
                                            carne:
                                              f.carne === item ? "" : f.carne,
                                            carne2:
                                              f.carne2 === item ? "" : f.carne2,
                                          }));
                                          return;
                                        }
                                        const count =
                                          (editForm.carne ? 1 : 0) +
                                          (editForm.carne2 &&
                                          editForm.carne2 !== editForm.carne
                                            ? 1
                                            : 0);
                                        if (count >= 2) return;
                                        setEditForm((f) => {
                                          if (!f.carne) {
                                            return { ...f, carne: item };
                                          }
                                          if (!f.carne2 && f.carne !== item) {
                                            return { ...f, carne2: item };
                                          }
                                          return f;
                                        });
                                      }}
                                      disabled={disabled}
                                      className="sr-only"
                                    />
                                    {item}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <div className={cn(editForm.sopa && "pointer-events-none opacity-40")}>
                            <p className="mb-1 text-xs font-medium">
                              Complementos (máx. 3)
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {menu!.complementos.map((item) => (
                                <label
                                  key={item}
                                  className={cn(
                                    "cursor-pointer rounded border px-2 py-1 text-xs transition-colors",
                                    editForm.complements.includes(item)
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-input hover:bg-muted/50",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={editForm.complements.includes(item)}
                                    onChange={() =>
                                      setEditForm((f) => ({
                                        ...f,
                                        complements: editForm.complements.includes(
                                          item,
                                        )
                                          ? editForm.complements.filter(
                                              (c) => c !== item,
                                            )
                                          : editForm.complements.length < 3
                                            ? [...editForm.complements, item]
                                            : editForm.complements,
                                      }))
                                    }
                                    className="sr-only"
                                  />
                                  {item}
                                </label>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label
                              htmlFor="edit-carne"
                              className="mb-1 block text-xs font-medium"
                            >
                              Carne
                            </label>
                            <input
                              id="edit-carne"
                              type="text"
                              value={editForm.carne}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  carne: e.target.value,
                                }))
                              }
                              className={cn(
                                "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
                                "focus:outline-none focus:ring-2 focus:ring-ring",
                              )}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="edit-complements"
                              className="mb-1 block text-xs font-medium"
                            >
                              Complementos (máx. 3, uno por línea)
                            </label>
                            <textarea
                              id="edit-complements"
                              rows={2}
                              value={editForm.complements.join("\n")}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  complements: e.target.value
                                    .split(/\n/)
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                    .slice(0, 3),
                                }))
                              }
                              className={cn(
                                "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
                                "focus:outline-none focus:ring-2 focus:ring-ring",
                              )}
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <label
                          htmlFor="edit-notes"
                          className="mb-1 block text-xs font-medium text-muted-foreground"
                        >
                          Notas (opcional)
                        </label>
                        <input
                          id="edit-notes"
                          type="text"
                          value={editForm.notes}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              notes: e.target.value,
                            }))
                          }
                          className={cn(
                            "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm",
                            "focus:outline-none focus:ring-2 focus:ring-ring",
                          )}
                        />
                      </div>
                      {editError && (
                        <p className="text-xs text-destructive" role="alert">
                          {editError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={editSubmitting}
                        >
                          {editSubmitting ? "Guardando…" : "Guardar"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingOrderId(null);
                            setEditError(null);
                          }}
                          disabled={editSubmitting}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{order.personName}</span>
                        <div className="flex items-center gap-1">
                          {canEditOrder(order) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openEditOrder(order)}
                            >
                              Editar
                            </Button>
                          )}
                          {isSessionOwner && !isLocked && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => handleDeleteOrder(order._id)}
                            >
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[
                          order.sopa,
                          order.carne &&
                            (order.carne2
                              ? `${order.carne} + ${order.carne2}`
                              : order.carne),
                          order.complements.length > 0
                            ? order.complements.join(", ")
                            : null,
                          order.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay pedidos.</p>
          )}
        </section>

        {summaryText != null && summaryText !== "" && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium">Resumen para el restaurante</h2>
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm">
              {summaryText}
            </pre>
            <Button type="button" variant="outline" onClick={handleCopySummary}>
              {copySummaryStatus === "ok"
                ? "Copiado"
                : copySummaryStatus === "fail"
                  ? "Error al copiar"
                  : "Copiar resumen"}
            </Button>
          </section>
        )}

        <Link
          to="/"
          className="inline-block text-sm text-muted-foreground underline"
        >
          Crear otra sesión
        </Link>
      </div>
    </div>
  );
}
