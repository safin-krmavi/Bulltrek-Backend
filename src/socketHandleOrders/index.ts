// sockets/service.ts
import { Server } from "http";
import { bootstrapSockets, registerSocketManager } from "../sockets/bootstrap";
import { app } from "..";
import { registerStockSocketManager } from "../sockets/stocks/socketBootstrap";
import { bootstrapStockSockets } from "../sockets/stocks/socketBootstrap";

let initialized = false;

registerSocketManager(app);
registerStockSocketManager(app)
export const initSocketService = async (server: Server) => {
  if (initialized) return;
  initialized = true;

  await bootstrapSockets();
  await bootstrapStockSockets
};
