module cargo_manifest::cargo_manifest {

    use std::string::String;

    public struct CargoManifest has key, store {
        id: UID,
        manifest_id: String,
        cargo_type: String,
        shipper: String,
        consignee: String,
        origin_country: String,
        destination: String,
        hts_code: String,
        declared_value: u64,
        weight_kg: u64,
        temperature_ok: bool,
        seal_intact: bool,
        fda_prior_notice: String,
        xray_cleared: bool,
        hazmat: bool,
        active: bool,
    }

    entry fun mint_to_sender(
        manifest_id: String,
        cargo_type: String,
        shipper: String,
        consignee: String,
        origin_country: String,
        destination: String,
        hts_code: String,
        declared_value: u64,
        weight_kg: u64,
        temperature_ok: bool,
        seal_intact: bool,
        fda_prior_notice: String,
        xray_cleared: bool,
        hazmat: bool,
        ctx: &mut TxContext
    ) {
        let manifest = CargoManifest {
            id: object::new(ctx),
            manifest_id,
            cargo_type,
            shipper,
            consignee,
            origin_country,
            destination,
            hts_code,
            declared_value,
            weight_kg,
            temperature_ok,
            seal_intact,
            fda_prior_notice,
            xray_cleared,
            hazmat,
            active: true,
        };
        transfer::transfer(manifest, ctx.sender());
    }

    public fun is_valid(manifest: &CargoManifest): bool {
        manifest.active
            && manifest.temperature_ok
            && manifest.seal_intact
            && manifest.xray_cleared
            && !manifest.hazmat
    }

    public fun manifest_id(m: &CargoManifest): &String { &m.manifest_id }
    public fun cargo_type(m: &CargoManifest): &String { &m.cargo_type }
    public fun shipper(m: &CargoManifest): &String { &m.shipper }
    public fun fda_prior_notice(m: &CargoManifest): &String { &m.fda_prior_notice }
    public fun active(m: &CargoManifest): bool { m.active }
    public fun temperature_ok(m: &CargoManifest): bool { m.temperature_ok }
    public fun seal_intact(m: &CargoManifest): bool { m.seal_intact }
    public fun xray_cleared(m: &CargoManifest): bool { m.xray_cleared }
    public fun hazmat(m: &CargoManifest): bool { m.hazmat }
}
