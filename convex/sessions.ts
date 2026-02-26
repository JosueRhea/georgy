import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const menuValidator = v.optional(
  v.object({
    sopas: v.array(v.string()),
    carnes: v.array(v.string()),
    complementos: v.array(v.string()),
  })
);

export const createSession = mutation({
  args: {
    deliveryTime: v.optional(v.string()),
    restaurantName: v.optional(v.string()),
    menu: menuValidator,
    ownerId: v.optional(v.string()),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      deliveryTime: args.deliveryTime ?? undefined,
      restaurantName: args.restaurantName ?? undefined,
      menu: args.menu ?? undefined,
      ownerId: args.ownerId ?? undefined,
    });
  },
});

export const updateSession = mutation({
  args: {
    sessionId: v.id("sessions"),
    deliveryTime: v.optional(v.string()),
    restaurantName: v.optional(v.string()),
    menu: menuValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    await ctx.db.patch("sessions", args.sessionId, {
      ...(args.deliveryTime !== undefined && { deliveryTime: args.deliveryTime }),
      ...(args.restaurantName !== undefined && { restaurantName: args.restaurantName }),
      ...(args.menu !== undefined && { menu: args.menu }),
    });
    return null;
  },
});

export const getSession = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({
      _id: v.id("sessions"),
      _creationTime: v.number(),
      deliveryTime: v.optional(v.string()),
      restaurantName: v.optional(v.string()),
      locked: v.optional(v.boolean()),
      ownerId: v.optional(v.string()),
      menu: menuValidator,
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

const orderValidator = v.object({
  _id: v.id("orders"),
  _creationTime: v.number(),
  sessionId: v.id("sessions"),
  personName: v.string(),
  carne: v.string(),
  carne2: v.optional(v.string()),
  complements: v.array(v.string()),
  notes: v.optional(v.string()),
  clientId: v.optional(v.string()),
});

export const listOrders = query({
  args: { sessionId: v.id("sessions") },
  returns: v.array(orderValidator),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

export const setSessionLocked = mutation({
  args: {
    sessionId: v.id("sessions"),
    locked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    await ctx.db.patch("sessions", args.sessionId, { locked: args.locked });
    return null;
  },
});

export const addOrder = mutation({
  args: {
    sessionId: v.id("sessions"),
    personName: v.string(),
    carne: v.string(),
    carne2: v.optional(v.string()),
    complements: v.array(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.string()),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.locked) throw new Error("No se aceptan más pedidos ni modificaciones.");
    if (args.complements.length > 3) throw new Error("Máximo 3 complementos");
    return await ctx.db.insert("orders", {
      sessionId: args.sessionId,
      personName: args.personName.trim(),
      carne: args.carne,
      carne2: args.carne2?.trim() || undefined,
      complements: args.complements,
      notes: args.notes?.trim() || undefined,
      clientId: args.clientId ?? undefined,
    });
  },
});

export const updateOrder = mutation({
  args: {
    orderId: v.id("orders"),
    sessionId: v.id("sessions"),
    personName: v.string(),
    carne: v.string(),
    carne2: v.optional(v.string()),
    complements: v.array(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.locked) throw new Error("No se aceptan más pedidos ni modificaciones.");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.sessionId !== args.sessionId) throw new Error("Order not found");
    const callerId = args.clientId ?? null;
    const isSessionOwner = session.ownerId != null && session.ownerId === callerId;
    const isOrderOwner = order.clientId != null && order.clientId === callerId;
    if (!isSessionOwner && !isOrderOwner) {
      throw new Error("No puedes editar este pedido.");
    }
    if (args.complements.length > 3) throw new Error("Máximo 3 complementos");
    await ctx.db.patch("orders", args.orderId, {
      personName: args.personName.trim(),
      carne: args.carne,
      carne2: args.carne2?.trim() || undefined,
      complements: args.complements,
      notes: args.notes?.trim() || undefined,
    });
    return null;
  },
});

export const deleteOrder = mutation({
  args: {
    orderId: v.id("orders"),
    sessionId: v.id("sessions"),
    clientId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.locked) throw new Error("No se aceptan más pedidos ni modificaciones.");

    const order = await ctx.db.get(args.orderId);
    if (!order || order.sessionId !== args.sessionId) throw new Error("Order not found");

    const callerId = args.clientId ?? null;
    const isSessionOwner = session.ownerId != null && session.ownerId === callerId;
    const isOrderOwner = order.clientId != null && order.clientId === callerId;
    if (!isSessionOwner && !isOrderOwner) {
      throw new Error("No puedes eliminar este pedido.");
    }

    await ctx.db.delete(args.orderId);
    return null;
  },
});

const ordinals = [
  "primero",
  "segundo",
  "tercero",
  "cuarto",
  "quinto",
  "sexto",
  "séptimo",
  "octavo",
  "noveno",
  "décimo",
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export const getSummaryText = query({
  args: {
    sessionId: v.id("sessions"),
    restaurantName: v.optional(v.string()),
    deliveryTime: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();

    const name = (args.restaurantName ?? session?.restaurantName ?? "georgy").trim();
    const time = (args.deliveryTime ?? session?.deliveryTime ?? "").trim();
    const total = orders.length;

    let text = `Hola ${name} quiero ${total} plato${total !== 1 ? "s" : ""}${time ? ` para las ${time}.` : "."}\n\n`;

    orders.forEach((order, i) => {
      const ord = ordinals[i] ?? `plato ${i + 1}`;
      text += `El ${ord} con:\n`;
      const carneMain = capitalize(order.carne);
      const carneSecond = order.carne2 ? capitalize(order.carne2) : null;
      const carneText = carneSecond ? `${carneMain} y ${carneSecond}` : carneMain;
      text += `${carneText}.\n`;
      order.complements.forEach((c) => {
        text += `${capitalize(c)}.\n`;
      });
      if (order.notes) {
        text += `${order.notes}\n`;
      }
      text += "\n";
    });

    return text.trim();
  },
});
