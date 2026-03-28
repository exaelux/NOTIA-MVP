module vehicle_certificate::vehicle_certificate {

    use std::string::String;

    public struct VehicleCertificate has key, store {
        id: UID,
        plate: String,
        owner_did: String,
        vehicle_class: String,
        cert_expiry: u64,
        active: bool,
    }

    public fun mint(
        plate: String,
        owner_did: String,
        vehicle_class: String,
        cert_expiry: u64,
        ctx: &mut TxContext
    ): VehicleCertificate {
        VehicleCertificate {
            id: object::new(ctx),
            plate,
            owner_did,
            vehicle_class,
            cert_expiry,
            active: true,
        }
    }

    entry fun mint_to_sender(
        plate: String,
        owner_did: String,
        vehicle_class: String,
        cert_expiry: u64,
        ctx: &mut TxContext
    ) {
        let cert = mint(plate, owner_did, vehicle_class, cert_expiry, ctx);
        transfer::transfer(cert, ctx.sender());
    }

    public fun is_valid(cert: &VehicleCertificate, current_time: u64): bool {
        cert.active && cert.cert_expiry > current_time
    }

    public fun plate(cert: &VehicleCertificate): &String { &cert.plate }
    public fun owner_did(cert: &VehicleCertificate): &String { &cert.owner_did }
    public fun vehicle_class(cert: &VehicleCertificate): &String { &cert.vehicle_class }
    public fun active(cert: &VehicleCertificate): bool { cert.active }

    public fun revoke(cert: &mut VehicleCertificate) {
        cert.active = false;
    }
}
