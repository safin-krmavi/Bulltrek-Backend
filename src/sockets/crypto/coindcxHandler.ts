/**
 * CoinDCX Socket Handler
 */
import { io } from "socket.io-client";
import { CryptoExchangeCredentials, logEvent } from "../utils";
import { SocketManager } from "../socketManagement";
import { Socket } from "socket.io-client";
import { generateSignatureCoinDCX } from "../../utils/crypto/exchange/coindcxUtils";
import { CryptoExchange, CryptoTradeType, TradeStatus } from "@prisma/client";
import { enqueueCoinDCXTradeUpdate } from "./spotTradeQueues/coindcxQueueManagement";
import prisma from "../../config/db.config";
import {
  mapStatus,
  resolveOrderTypeKey,
} from "../../constants/crypto/exchange/coindcx";
import { handleCoinDCXFuturesWebsocketMessage } from "../../services/crypto/exchangeSocketServices/coinDCXSocketService";
import { tradeStatusPriority } from "../../constants/crypto";
import { applySpotTradeExecution } from "../../utils/crypto/pnlCalc/spotPnlEngine";

export const CoinDCXHandler = {
  // Connect to CoinDCX WebSocket
  connect(userId: string, credentials: CryptoExchangeCredentials): Socket {
    const body = { channel: "coindcx" };
    const signature = generateSignatureCoinDCX(body, credentials.apiSecret);
    const socketEndpoint = "wss://stream.coindcx.com";

    // Create and configure Socket.IO client
    const socket = io(socketEndpoint, {
      transports: ["websocket"],
    });

    // Create ping interval (just to be safe)
    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("ping");
      }
    }, 30000);

    // Register socket with manager
    SocketManager.registerSocket(
      userId,
      CryptoExchange.COINDCX,
      "all", // CoinDCX uses a single socket for all markets
      socket,
      "crypto",
      pingInterval
    );

    // Set up event handlers
    this.setupEventHandlers(socket, userId, credentials);

    return socket;
  },

  // Set up all event handlers for CoinDCX WebSocket
  setupEventHandlers(
    socket: Socket,
    userId: string,
    credentials: CryptoExchangeCredentials
  ): void {
    socket.on("connect", () => {
      logEvent("CONNECTED", {
        userId,
        exchange: CryptoExchange.COINDCX,
      });
      // Join channel with authentication
      socket.emit("join", {
        channelName: "coindcx",
        authSignature: generateSignatureCoinDCX(
          { channel: "coindcx" },
          credentials.apiSecret
        ),
        apiKey: credentials.apiKey,
      });
    });
    socket.on("connect_error", (error) => {
      console.log("COINDCX_CONNECTION_ERROR", {
        userId,
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
    });

    socket.on("join-failure", (response) => {
      console.log("COINDCX_JOIN_FAILURE", {
        userId,
        error: response,
      });
    });
    socket.on("order-update", async (response: any) => {
      try {
        const orders = JSON.parse(response.data);
        console.log("COINDCX_PARSED_ORDERS", { data: orders });

        // Process each order in the update
        for (const order of orders) {
          if (!order.status) {
            console.log("COINDCX_ORDER_STATUS_MISSING", {
              error: order,
            });
            return;
          }

          // // Skip initial or failed orders
          // if (order.status === "failed" || order.status === "initial") {
          //   return;
          // }

          console.log("COINDCX SPOT TRADE");
          enqueueCoinDCXTradeUpdate(
            order,
            userId,
            this.handleSpotOrderUpdate.bind(this)
          );
        }
      } catch (error) {
        console.log("ERROR_PROCESSING_COINDCX_ORDER_UPDATE", {
          error:
            (error as any)?.data ||
            (error as any)?.response?.data ||
            (error as any)?.message ||
            error,
        });
      }
    });

    socket.on("df-order-update", async (response: any) => {
      console.log("COINDCX_FUTURES_UPDATE_RECEIVED", { data: response });

      try {
        console.log("COINDCX FUTURES TRADE");

        await handleCoinDCXFuturesWebsocketMessage(response, userId, {
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
        });
      } catch (error) {
        console.log("ERROR_PROCESSING_COINDCX_FUTURES_UPDATE", {
          error:
            (error as any)?.data ||
            (error as any)?.response?.data ||
            (error as any)?.message ||
            error,
        });
      }
    });
    let reconnectAttempts = 0;
    const maxReconnects = 5;

    socket.on("disconnect", () => {
      console.log("COINDCX_WEBSOCKET_DISCONNECTED", { userId });

      // Remove socket from registry
      SocketManager.removeSocket(userId, CryptoExchange.COINDCX, "all");

      // Attempt to reconnect after delay
      setTimeout(() => {
        if (reconnectAttempts < maxReconnects) {
          console.log("ATTEMPTING_COINDCX_RECONNECTION", {
            userId,
            attempt: reconnectAttempts + 1,
          });
          this.connect(userId, credentials);
          reconnectAttempts++;
        } else {
          console.log("COINDCX_MAX_RECONNECT_ATTEMPTS_REACHED", {
            userId,
            maxReconnects,
          });
        }
      }, 5000);
    });

    socket.on("error", (error) => {
      console.log("COINDCX_WEBSOCKET_ERROR", {
        error:
          (error as any)?.data ||
          (error as any)?.response?.data ||
          (error as any)?.message ||
          error,
      });
    });
  },

  // Handle CoinDCX spot order updates
  async handleSpotOrderUpdate(order: any, userId: string): Promise<void> {
    try {
      console.log("COINDCX ORDER IN HANDLER", order);
      const exchangeOrderId = (order.id || order.order_id)?.toString();
      if (!exchangeOrderId) return;
      const orderType = resolveOrderTypeKey(order.order_type)?.toUpperCase();
      const tradeStatus = mapStatus(order.status);
      console.log("TRADE STATUS", tradeStatus);
      const requestedQty = parseFloat(order.total_quantity || "0");
      const filledQty = parseFloat(
        order.filled_quantity ||
          order.executed_quantity ||
          order.filled_qty ||
          "0"
      );

      console.log("REQUESTED QTY", requestedQty);
      console.log("FILLED QTY", filledQty);
      const price =
        order.price_per_unit && order.price_per_unit !== 0
          ? order.price_per_unit
          : order.avg_price && order.avg_price !== 0
          ? order.avg_price
          : 0;

      //  STEP 1: FIND / CREATE LOCAL ORDER

      let localOrder = await prisma.cryptoOrder.findFirst({
        where: {
          exchangeOrderId,
          userId,
          exchange: CryptoExchange.COINDCX,
        },
      });
      console.log("LOCAL ORDER FOUND?", !!localOrder);

      if (!localOrder) {
        console.log("CREATING LOCAL ORDER");

        localOrder = await prisma.cryptoOrder.create({
          data: {
            userId,
            exchange: CryptoExchange.COINDCX,
            type: CryptoTradeType.SPOT,
            symbol: order.market,
            side: order.side.toUpperCase(),
            orderType,
            requestedQty,
            requestedPrice: price,
            filledQty,
            status: tradeStatus,
            exchangeOrderId,
          },
        });
        console.log("LOCAL ORDER CREATED", localOrder.id);
      } else {
        console.log("LOCAL ORDER STATUS", localOrder.status);

        if (
          tradeStatusPriority[tradeStatus] >
          tradeStatusPriority[localOrder.status]
        ) {
          console.log("UPDATING LOCAL ORDER STATUS");

          await prisma.cryptoOrder.update({
            where: { id: localOrder.id },
            data: {
              status: tradeStatus,
              filledQty,
            },
          });
        }
      }

      //   STEP 2: FIND / CREATE TRADE

      let existingTrade = await prisma.cryptoTrades.findFirst({
        where: {
          orderId: localOrder.id,
          userId,
          exchange: CryptoExchange.COINDCX,
        },
        orderBy: { createdAt: "desc" },
      });
      console.log("EXISTING TRADE FOUND?", !!existingTrade);

      const isExecutable =
        tradeStatus === TradeStatus.EXECUTED ||
        tradeStatus === TradeStatus.PARTIALLY_FILLED;

      console.log("IS EXECUTABLE?", isExecutable);

      if (
        !existingTrade &&
        isExecutable &&
        (filledQty > 0 || requestedQty > 0)
      ) {
        console.log("CREATING TRADE ENTRY");
        const newTrade = await prisma.cryptoTrades.create({
          data: {
            userId,
            exchange: CryptoExchange.COINDCX,
            type: CryptoTradeType.SPOT,
            symbol: order.market,
            side: order.side.toUpperCase(),
            orderType,
            orderId: localOrder.id,
            quantity: requestedQty,
            price,
            fee: parseFloat(order.fee || "0"),
            status: tradeStatus,
          },
        });
        console.log("TRADE CREATED", newTrade.id);

        await applySpotTradeExecution({
          userId,
          exchange: CryptoExchange.COINDCX,
          asset: order.market,
          side: order.side.toUpperCase(),
          quantity: requestedQty,
          price,
          fee: parseFloat(order.fee || "0"),
          tradeId: newTrade.id,
        });
      } else if (existingTrade) {
        if (
          tradeStatusPriority[tradeStatus] >
          tradeStatusPriority[existingTrade.status]
        ) {
          console.log("HIGHER PRIORITY STATUS ENCOUNTERED");
          await prisma.cryptoTrades.update({
            where: { id: existingTrade.id },
            data: {
              status: tradeStatus,
              fee: parseFloat(order.fee || "0"),
            },
          });
        }
      }
    } catch (err) {
      console.error("ERROR_PROCESSING_COINDCX_SPOT_ORDER", {
        orderId: order?.id,
        error:
          (err as any)?.data ||
          (err as any)?.response?.data ||
          (err as any)?.message ||
          err,
      });
    }
  },
};
