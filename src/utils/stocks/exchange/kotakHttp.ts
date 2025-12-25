import https from "https";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

export const kotakHttpsAgent = new https.Agent({
  keepAlive: false,
  maxSockets: 1,
});
