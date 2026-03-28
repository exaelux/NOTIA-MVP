import { IotaClient } from '@iota/iota-sdk/client';
import { Ed25519Keypair } from '@iota/iota-sdk/keypairs/ed25519';
import { Transaction } from '@iota/iota-sdk/transactions';
import { networkLabel, requireIotaRpcUrl } from './network.js';

export class TestnetIotaAnchorAdapter {
  private client: IotaClient;
  private keypair: Ed25519Keypair;
  private readonly network = networkLabel();
  private readonly packageId: string;

  constructor() {
    const rpc = requireIotaRpcUrl();
    const privateKey = process.env.IOTA_PRIVATE_KEY?.trim();
    const packageId = process.env.NOTIA_ANCHOR_PACKAGE_ID?.trim();

    if (!privateKey) throw new Error('Missing IOTA_PRIVATE_KEY');
    if (!packageId) throw new Error('Missing NOTIA_ANCHOR_PACKAGE_ID');

    this.client = new IotaClient({ url: rpc });
    this.keypair = Ed25519Keypair.fromSecretKey(privateKey);
    this.packageId = packageId;
  }

  async anchor(bundle: any) {
    if (!bundle?.meaning?.bundle_ref) {
      throw new Error('Invalid bundle: missing bundle_ref');
    }

    const bundleRefHex = bundle.meaning.bundle_ref;

    const bundleBytes = Uint8Array.from(Buffer.from(bundleRefHex, 'hex'));

    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::notia_anchor::anchor`,
      arguments: [
        tx.pure.vector('u8', bundleBytes),
      ],
    });

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
    });

    return {
      network: this.network,
      transaction_id: result.digest,
      status: 'confirmed',
      anchored_at: new Date().toISOString(),
    };
  }
}
