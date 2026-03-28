module notia_anchor::notia_anchor;

use iota::event;

public struct NotiaRegistry has key {
    id: iota::object::UID,
}

public struct NotiaAnchor has key {
    id: iota::object::UID,
    bundle_hash: vector<u8>,
}

public struct AnchorEvent has copy, drop, store {
    bundle_hash: vector<u8>,
}

fun init(ctx: &mut iota::tx_context::TxContext) {
    iota::transfer::share_object(NotiaRegistry { id: iota::object::new(ctx) });
}

public entry fun anchor(bundle_hash: vector<u8>, ctx: &mut iota::tx_context::TxContext) {
    let hash_for_event = copy bundle_hash;
    let obj = NotiaAnchor {
        id: iota::object::new(ctx),
        bundle_hash,
    };

    event::emit(AnchorEvent {
        bundle_hash: hash_for_event,
    });
    iota::transfer::share_object(obj);
}
