export type AnchorStatus = string;

export interface AnchorResult {
  network: string;
  transaction_id: string;
  anchored_at: string;
  status: string;
}

export interface AnchorAdapter {
  anchor(bundle: unknown): Promise<AnchorResult>;
}

export interface ComplianceAnchorInput {
  subject_ref: string;
  profile_id: string;
  result: boolean;
  bundle_hash: string;
}

export interface ComplianceAnchorAdapter {
  submitProof(input: ComplianceAnchorInput): Promise<AnchorResult>;
}
