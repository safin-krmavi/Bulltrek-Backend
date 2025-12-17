// sockets/service.ts
import { Server } from "http";
import { bootstrapSockets, registerSocketManager } from "../sockets/bootstrap";
import { app } from "..";

let initialized = false;
registerSocketManager(app);
export const initSocketService = async (server: Server) => {
  if (initialized) return;
  initialized = true;

  await bootstrapSockets();
};
