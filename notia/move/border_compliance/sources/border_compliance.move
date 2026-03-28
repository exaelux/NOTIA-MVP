module border_compliance::border_compliance;

use iota::event;

public struct BorderComplianceProof has key {
    id: iota::object::UID,
    subject_ref: vector<u8>,
    profile_id: vector<u8>,
    result: bool,
    bundle_hash: vector<u8>,
}

public struct ComplianceEvent has copy, drop, store {
    subject_ref: vector<u8>,
    profile_id: vector<u8>,
    result: bool,
    bundle_hash: vector<u8>,
}

public entry fun submit_proof(
    subject_ref: vector<u8>,
    profile_id: vector<u8>,
    result: bool,
    bundle_hash: vector<u8>,
    ctx: &mut iota::tx_context::TxContext
) {
    let subject_for_event = copy subject_ref;
    let profile_for_event = copy profile_id;
    let hash_for_event = copy bundle_hash;

    let proof = BorderComplianceProof {
        id: iota::object::new(ctx),
        subject_ref,
        profile_id,
        result,
        bundle_hash,
    };

    event::emit(ComplianceEvent {
        subject_ref: subject_for_event,
        profile_id: profile_for_event,
        result,
        bundle_hash: hash_for_event,
    });

    iota::transfer::share_object(proof);
}
