import axios from "axios";
import crypto from "crypto";
import {
  KUCOIN_FUTURES_BASE_URL,
  KUCOIN_GET_SERVER_TIME_ENDPOINT,
} from "../../../constants/crypto/externalUrls";
import { KucoinConfig } from "../../../constants/crypto/exchange/kucoin";

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64");
}

export async function generateKucoinServerTime(): Promise<string> {
  const res = await axios.get(
    `${KUCOIN_FUTURES_BASE_URL}${KUCOIN_GET_SERVER_TIME_ENDPOINT}`
  );
  return res.data.data.toString(); // returns a string like "1715270723000"
}

// function getBrokerConfigFromEnv(): {
//   spot: KucoinBrokerConfig | null;
//   futures: KucoinBrokerConfig | null;
// } {
//   const enableBroker = process.env.KUCOIN_ENABLE_BROKER === "true";

//   // If broker is not enabled globally, return null for both
//   if (!enableBroker) {
//     return { spot: null, futures: null };
//   }

//   // Spot configuration from environment
//   const spotConfig: KucoinBrokerConfig | null = (() => {
//     const partner = process.env.KUCOIN_BROKER_PARTNER_SPOT || "";
//     const brokerKey = process.env.KUCOIN_BROKER_KEY_SPOT || "";
//     const brokerName = process.env.KUCOIN_BROKER_NAME_SPOT || "";

//     return {
//       partner,
//       brokerKey,
//       brokerName,
//       enableBroker: true,
//     };
//   })();

//   // Futures configuration from environment
//   const futuresConfig: KucoinBrokerConfig | null = (() => {
//     const partner = process.env.KUCOIN_BROKER_PARTNER_FUTURES || "";
//     const brokerKey = process.env.KUCOIN_BROKER_KEY_FUTURES || "";
//     const brokerName = process.env.KUCOIN_BROKER_NAME_FUTURES || "";

//     return {
//       partner,
//       brokerKey,
//       brokerName,
//       enableBroker: true,
//     };
//   })();

//   return {
//     spot: spotConfig,
//     futures: futuresConfig,
//   };
// }

// // Updated function to generate broker signature
// function generateBrokerSignature(
//   brokerKey: string,
//   timestamp: string,
//   partner: string,
//   apiKey: string
// ): string {
//   const prehash = `${timestamp}${partner}${apiKey}`;
//   return crypto
//     .createHmac("sha256", brokerKey)
//     .update(prehash)
//     .digest("base64");
// }

export async function generateHeadersKucoin(
  config: KucoinConfig,
  method: "GET" | "POST" | "DELETE",
  endpoint: string,
  body: string = "",
  marketType: "spot" | "futures" = "spot"
) {
  const timestamp = await generateKucoinServerTime();

  const prehash = `${timestamp}${method.toUpperCase()}${endpoint}${body}`;
  const signature = sign(prehash, config.apiSecret);

  const headers: any = {
    "KC-API-KEY": config.apiKey,
    "KC-API-SIGN": signature,
    "KC-API-TIMESTAMP": timestamp,
    "KC-API-PASSPHRASE": config.apiPassphrase,
    "KC-API-KEY-VERSION": config.apiKeyVersion || "v3",
    "Content-Type": "application/json",
  }; // Get broker config from environment variables if not provided
  //   const { spot, futures } = getBrokerConfigFromEnv();
  //   const brokerConfig = marketType === "spot" ? spot : futures;

  //   if (brokerConfig?.enableBroker) {
  //     const brokerSignature = generateBrokerSignature(
  //       brokerConfig.brokerKey,
  //       timestamp,
  //       brokerConfig.partner,
  //       config.apiKey
  //     );

  //     headers["KC-API-PARTNER"] = brokerConfig.partner;
  //     headers["KC-API-PARTNER-SIGN"] = brokerSignature;
  //     headers["KC-BROKER-NAME"] = brokerConfig.brokerName;
  //     headers["KC-API-PARTNER-VERIFY"] = "true";
  //   }

  return headers;
}

export const handleKucoinError = (error: any) => {
  const exchangeMessage =
    error.response?.data?.msg ||
    error.response?.data?.message ||
    error.message ||
    "Unknown exchange error";
  // console.log(error);

  if (error.response?.status === 401 || error.response?.status === 403) {
    throw {
      code: "AUTH_INVALID",
      message: exchangeMessage,
    };
  }

  if (error.response?.status === 429) {
    throw {
      code: "RATE_LIMITED",
      message: exchangeMessage,
    };
  }

  throw {
    code: "EXCHANGE_UNAVAILABLE",
    message: exchangeMessage,
  };
};
