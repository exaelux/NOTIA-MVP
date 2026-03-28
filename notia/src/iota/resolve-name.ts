import { IotaGraphQLClient } from "@iota/iota-sdk/graphql";
import { IotaNamesClient } from "@iota/iota-names-sdk";
import { detectIotaNetwork, resolveIotaGraphqlUrl } from "./network.js";

async function resolveIotaName(address: string): Promise<string | null> {
  try {
    const graphqlUrl = resolveIotaGraphqlUrl();
    const iotaNamesClient = new IotaNamesClient({
      graphQlClient: new IotaGraphQLClient({ url: graphqlUrl }),
      network: detectIotaNetwork() as any,
    });

    return await iotaNamesClient.getPublicName(address);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[resolveIotaName] failed for ${address}: ${message}`);
    return null;
  }
}

export { resolveIotaName };
export default resolveIotaName;
