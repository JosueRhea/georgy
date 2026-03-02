import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { parseMenu } from "../lib/parseMenu";
import { getOrCreateBrowserUserId } from "../lib/browserUserId";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

export default function CreateSession() {
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.createSession);
  const [menuText, setMenuText] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const menu = menuText.trim() ? parseMenu(menuText) : undefined;
      const ownerId = getOrCreateBrowserUserId();
      const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : undefined;
      const sessionId: Id<"sessions"> = await createSession({
        deliveryTime: deliveryTime.trim() || undefined,
        restaurantName: restaurantName.trim() || undefined,
        menu: menu
          ? {
              sopas: menu.sopas,
              carnes: menu.carnes,
              complementos: menu.complementos,
            }
          : undefined,
        ownerId: ownerId || undefined,
        expiresAt: expiresAtMs,
      });
      navigate(`/s/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-foreground">
            Crear pedido grupal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pega el menú del día y comparte el enlace para que añadan su pedido.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="menu"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Menú del día (opcional)
            </label>
            <textarea
              id="menu"
              rows={10}
              placeholder="Pega aquí el mensaje del restaurante (Sopas, CARNES, COMPLEMENTOS...)"
              value={menuText}
              onChange={(e) => setMenuText(e.target.value)}
              className={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="restaurant"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Nombre del restaurante (opcional)
              </label>
              <input
                id="restaurant"
                type="text"
                placeholder="ej. georgy"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
            </div>
            <div>
              <label
                htmlFor="time"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Hora de entrega (opcional)
              </label>
              <input
                id="time"
                type="text"
                placeholder="ej. 11:50"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="expiresAt"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Cierre automático (opcional)
              </label>
              <input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                min={(() => {
                  const d = new Date(Date.now() + 60_000);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                })()}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Si lo indicas, el enlace se bloqueará automáticamente en esa fecha y hora.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creando…" : "Crear sesión y obtener enlace"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground">
          Si pegas el menú, los participantes elegirán de una lista. Si no, podrán
          escribir su carne y complementos a mano.
        </p>
      </div>
    </div>
  );
}
