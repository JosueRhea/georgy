import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    deliveryTime: v.optional(v.string()),
    restaurantName: v.optional(v.string()),
    locked: v.optional(v.boolean()),
    ownerId: v.optional(v.string()),
    menu: v.optional(
      v.object({
        sopas: v.array(v.string()),
        carnes: v.array(v.string()),
        complementos: v.array(v.string()),
      })
    ),
  }),

  orders: defineTable({
    sessionId: v.id("sessions"),
    personName: v.string(),
    carne: v.string(),
    carne2: v.optional(v.string()),
    complements: v.array(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),
});
