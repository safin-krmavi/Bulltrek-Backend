import { Server } from "http";
import express from "express";
import { bootstrapSockets, registerSocketManager } from "../sockets/bootstrap";
import {
  registerStockSocketManager,
  bootstrapStockSockets,
} from "../sockets/stocks/socketBootstrap";
import { app } from "..";

let initialized = false;

export const initSocketService = async (server: Server) => {
  if (initialized) return;
  initialized = true;

  // 1️⃣ Register socket managers
  registerSocketManager(app);
  registerStockSocketManager(app);

  // 2️⃣ Bootstrap all sockets
  await bootstrapSockets();
  await bootstrapStockSockets();

  console.log("Socket service fully initialized");
};
