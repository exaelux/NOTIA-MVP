import type { CanonicalEvent } from "../core/types.js";

const ROUTING_TABLE: Readonly<Record<string, readonly string[]>> = {
  access: ["access"],
  identity: ["identity"],
  supply: ["supply"],
  token: ["token"],
};

export function routeEvent(event: CanonicalEvent): string[] {
  const microtools = ROUTING_TABLE[event.domain];
  return microtools ? [...microtools] : [];
}
