import {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart
} from "../controller/cartController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

export default async function cartRoutes(fastify, opts) {
  // ✅ All cart routes require authentication and must be 'user' role
  const cartMiddleware = [protect, authorize("user")];

  // ✅ Add to cart / Get cart / Clear entire cart
  fastify.post("/", { preHandler: cartMiddleware }, addToCart);
  fastify.get("/", { preHandler: cartMiddleware }, getCart);
  fastify.delete("/", { preHandler: cartMiddleware }, clearCart);

  // ✅ Update or remove specific cart item
  fastify.put("/items/:itemId", { preHandler: cartMiddleware }, updateCartItem);
  fastify.delete("/items/:itemId", { preHandler: cartMiddleware }, removeFromCart);
}