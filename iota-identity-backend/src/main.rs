use std::env;
use std::path::Path;

use anyhow::{anyhow, Context, Result};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use identity_iota::iota::IotaDocument;
use identity_iota::iota::rebased::client::IdentityClient;
use identity_iota::iota::rebased::client::IotaKeySignature;
use identity_iota::iota::rebased::utils::request_funds;
use identity_iota::iota_interaction::OptionalSync;
use identity_iota::storage::{JwkDocumentExt, JwkMemStore, KeyIdMemstore, Storage};
use identity_iota::storage::JwsSignatureOptions;
use identity_iota::verification::jws::JwsAlgorithm;
use identity_iota::verification::MethodScope;
use identity_iota::core::{json, FromJson, Url, Duration, Timestamp};
use identity_iota::credential::{
    Credential, CredentialBuilder, Subject, Jwt,
    Presentation, PresentationBuilder,
    JwtCredentialValidationOptions, JwtCredentialValidator, FailFast,
    JwtPresentationOptions, JwtPresentationValidationOptions, JwtPresentationValidator,
    JwtCredentialValidatorUtils, JwtPresentationValidatorUtils, SubjectHolderRelationship,
    DecodedJwtCredential, DecodedJwtPresentation,
};
use identity_iota::did::{DID, CoreDID};
use identity_iota::document::verifiable::JwsVerificationOptions;
use identity_iota::resolver::Resolver;
use identity_eddsa_verifier::EdDSAJwsVerifier;
use identity_storage::{JwkStorage, KeyIdStorage, KeyType, StorageSigner};
use identity_stronghold::StrongholdStorage;
use iota_sdk::IotaClientBuilder;
use iota_sdk::types::base_types::IotaAddress;
use iota_sdk::types::base_types::ObjectID;
use iota_sdk_legacy::client::secret::stronghold::StrongholdSecretManager;
use iota_sdk_legacy::client::Password;
use secret_storage::Signer;
use serde::Serialize;
use tokio::fs;
use tracing::info;

const PORT: u16 = 3002;
const GAS_BUDGET: u64 = 50_000_000;

const DRIVER_DID_FILE: &str = "driver_did.json";
const DRIVER_FRAGMENT_FILE: &str = "driver_fragment.txt";
const DRIVER_STRONGHOLD_FILE: &str = "driver.stronghold";

const ISSUER_DID_FILE: &str = "issuer_did.json";
const ISSUER_FRAGMENT_FILE: &str = "issuer_fragment.txt";
const ISSUER_STRONGHOLD_FILE: &str = "issuer.stronghold";

const DRIVER_VC_FILE: &str = "driver_vc.jwt";
const DRIVER_VP_FILE: &str = "driver_vp.jwt";

#[derive(Clone)]
struct AppState;

#[derive(Clone)]
struct EnvConfig {
    api_endpoint: String,
    package_id: identity_iota::iota_interaction::types::base_types::ObjectID,
    stronghold_password: String,
}

#[derive(Clone)]
struct ActorFiles {
    did_file: &'static str,
    fragment_file: &'static str,
    stronghold_file: &'static str,
}

const DRIVER_FILES: ActorFiles = ActorFiles {
    did_file: DRIVER_DID_FILE,
    fragment_file: DRIVER_FRAGMENT_FILE,
    stronghold_file: DRIVER_STRONGHOLD_FILE,
};

const ISSUER_FILES: ActorFiles = ActorFiles {
    did_file: ISSUER_DID_FILE,
    fragment_file: ISSUER_FRAGMENT_FILE,
    stronghold_file: ISSUER_STRONGHOLD_FILE,
};

#[derive(Clone)]
struct ActorIdentity {
    document: IotaDocument,
    fragment: String,
}

type StrongholdDidStorage = Storage<StrongholdStorage, StrongholdStorage>;
type SignedIdentityClient<'a> = IdentityClient<StorageSigner<'a, StrongholdStorage, StrongholdStorage>>;

type ApiResult<T> = std::result::Result<Json<T>, AppError>;

#[derive(Debug)]
struct AppError(anyhow::Error);

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self(value.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()).into_response()
    }
}

#[derive(Serialize)]
struct DidResponse {
    did: String,
}

#[derive(Serialize)]
struct VcResponse {
    vc: String,
}

#[derive(Serialize)]
struct VpResponse {
    vp: String,
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
    holder: String,
    credential_count: usize,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let app = Router::new()
        .route("/driver/create-did", post(create_driver_did))
        .route("/driver/issue-vc", post(issue_driver_vc))
        .route("/driver/create-vp", post(create_driver_vp))
        .route("/driver/verify", post(verify_driver_vp))
        .with_state(AppState);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", PORT)).await?;
    info!("identity server listening on 0.0.0.0:{PORT}");
    axum::serve(listener, app).await?;

    Ok(())
}

async fn create_driver_did(State(_state): State<AppState>) -> ApiResult<DidResponse> {
    let cfg = load_env_config()?;

    if fs::try_exists(DRIVER_DID_FILE).await? {
        let driver = load_actor_identity(&DRIVER_FILES).await?;
        return Ok(Json(DidResponse {
            did: driver.document.id().to_string(),
        }));
    }

    let driver = create_actor_identity(&DRIVER_FILES, &cfg).await?;

    Ok(Json(DidResponse {
        did: driver.document.id().to_string(),
    }))
}

async fn issue_driver_vc(State(_state): State<AppState>) -> ApiResult<VcResponse> {
    let cfg = load_env_config()?;

    let driver = load_actor_identity(&DRIVER_FILES)
        .await
        .context("driver DID not found; call POST /driver/create-did first")?;

    let issuer = ensure_actor_identity(&ISSUER_FILES, &cfg).await?;
    let issuer_storage = open_stronghold_storage(ISSUER_STRONGHOLD_FILE, &cfg.stronghold_password)?;

    let subject = Subject::from_json_value(json!({
        "id": driver.document.id().as_str(),
        "name": "Joe Bloggs",
        "licenseNumber": "UK-TRK-2024-001",
        "vehicleClass": "HGV",
        "country": "GB"
    }))?;

    let credential: Credential = CredentialBuilder::default()
        .issuer(Url::parse(issuer.document.id().as_str())?)
        .type_("DriverIdentityCredential")
        .subject(subject)
        .build()?;

    let credential_jwt: Jwt = issuer
        .document
        .create_credential_jwt(
            &credential,
            &issuer_storage,
            &issuer.fragment,
            &JwsSignatureOptions::default(),
            None,
        )
        .await?;

    fs::write(DRIVER_VC_FILE, credential_jwt.as_str()).await?;

    Ok(Json(VcResponse {
        vc: credential_jwt.as_str().to_owned(),
    }))
}

async fn create_driver_vp(State(_state): State<AppState>) -> ApiResult<VpResponse> {
    let cfg = load_env_config()?;

    let driver = load_actor_identity(&DRIVER_FILES)
        .await
        .context("driver DID not found; call POST /driver/create-did first")?;

    let driver_storage = open_stronghold_storage(DRIVER_STRONGHOLD_FILE, &cfg.stronghold_password)?;

    let vc_jwt = Jwt::from(fs::read_to_string(DRIVER_VC_FILE).await?.trim().to_owned());

    let presentation: Presentation<Jwt> =
        PresentationBuilder::new(driver.document.id().to_url().into(), Default::default())
            .credential(vc_jwt)
            .build()?;

    let expires: Timestamp = Timestamp::now_utc()
        .checked_add(Duration::minutes(10))
        .ok_or_else(|| anyhow!("failed to compute VP expiration timestamp"))?;

    let vp_jwt: Jwt = driver
        .document
        .create_presentation_jwt(
            &presentation,
            &driver_storage,
            &driver.fragment,
            &JwsSignatureOptions::default(),
            &JwtPresentationOptions::default().expiration_date(expires),
        )
        .await?;

    fs::write(DRIVER_VP_FILE, vp_jwt.as_str()).await?;

    Ok(Json(VpResponse {
        vp: vp_jwt.as_str().to_owned(),
    }))
}

async fn verify_driver_vp(State(_state): State<AppState>) -> ApiResult<VerifyResponse> {
    let cfg = load_env_config()?;

    let vp_jwt = Jwt::from(fs::read_to_string(DRIVER_VP_FILE).await?.trim().to_owned());

    let identity_client = build_read_only_identity_client(&cfg).await?;

    let mut resolver: Resolver<IotaDocument> = Resolver::new();
    resolver.attach_iota_handler(identity_client.clone());

    let holder_did: CoreDID = JwtPresentationValidatorUtils::extract_holder(&vp_jwt)?;
    let holder_doc = resolver.resolve(&holder_did).await?;

    let presentation_options = JwtPresentationValidationOptions::default()
        .presentation_verifier_options(JwsVerificationOptions::default());

    let decoded: DecodedJwtPresentation<Jwt> = JwtPresentationValidator::with_signature_verifier(
        EdDSAJwsVerifier::default(),
    )
    .validate(&vp_jwt, &holder_doc, &presentation_options)?;

    let jwt_credentials = &decoded.presentation.verifiable_credential;

    let issuers: Vec<CoreDID> = jwt_credentials
        .iter()
        .map(JwtCredentialValidatorUtils::extract_issuer_from_jwt)
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let issuer_documents = resolver.resolve_multiple(&issuers).await?;

    let credential_validator: JwtCredentialValidator<EdDSAJwsVerifier> =
        JwtCredentialValidator::with_signature_verifier(EdDSAJwsVerifier::default());

    let credential_options = JwtCredentialValidationOptions::default()
        .subject_holder_relationship(holder_did.to_url().into(), SubjectHolderRelationship::AlwaysSubject);

    for (index, jwt_vc) in jwt_credentials.iter().enumerate() {
        let issuer_document = issuer_documents
            .get(&issuers[index])
            .ok_or_else(|| anyhow!("issuer document missing during verification"))?;

        let _: DecodedJwtCredential<serde_json::Value> = credential_validator
            .validate::<_, serde_json::Value>(
                jwt_vc,
                issuer_document,
                &credential_options,
                FailFast::FirstError,
            )?;
    }

    Ok(Json(VerifyResponse {
        valid: true,
        holder: holder_did.to_string(),
        credential_count: jwt_credentials.len(),
    }))
}

fn load_env_config() -> Result<EnvConfig> {
    let api_endpoint = env::var("IOTA_API_ENDPOINT")
        .context("missing environment variable IOTA_API_ENDPOINT")?;

    let package_id = env::var("IOTA_IDENTITY_PKG_ID")
        .context("missing environment variable IOTA_IDENTITY_PKG_ID")?
        .parse::<identity_iota::iota_interaction::types::base_types::ObjectID>()
        .context("IOTA_IDENTITY_PKG_ID is not a valid ObjectID")?;

    let stronghold_password =
        env::var("STRONGHOLD_PASSWORD").context("missing environment variable STRONGHOLD_PASSWORD")?;

    Ok(EnvConfig {
        api_endpoint,
        package_id,
        stronghold_password,
    })
}

async fn ensure_actor_identity(files: &ActorFiles, cfg: &EnvConfig) -> Result<ActorIdentity> {
    if fs::try_exists(files.did_file).await? {
        load_actor_identity(files).await
    } else {
        create_actor_identity(files, cfg).await
    }
}

async fn load_actor_identity(files: &ActorFiles) -> Result<ActorIdentity> {
    let did_json = fs::read_to_string(files.did_file)
        .await
        .with_context(|| format!("failed reading {}", files.did_file))?;

    let fragment = fs::read_to_string(files.fragment_file)
        .await
        .with_context(|| format!("failed reading {}", files.fragment_file))?
        .trim()
        .to_owned();

    if fragment.is_empty() {
        return Err(anyhow!("{} is empty", files.fragment_file));
    }

    let document: IotaDocument = serde_json::from_str(&did_json)
        .with_context(|| format!("failed parsing {} as IotaDocument JSON", files.did_file))?;

    Ok(ActorIdentity { document, fragment })
}

async fn create_actor_identity(files: &ActorFiles, cfg: &EnvConfig) -> Result<ActorIdentity> {
    let storage = open_stronghold_storage(files.stronghold_file, &cfg.stronghold_password)?;
    let identity_client = build_signed_identity_client(&storage, cfg).await?;

    let mut unpublished = IotaDocument::new(identity_client.network());
    let fragment = unpublished
        .generate_method(
            &storage,
            JwkMemStore::ED25519_KEY_TYPE,
            JwsAlgorithm::EdDSA,
            None,
            MethodScope::VerificationMethod,
        )
        .await?;

    let document = identity_client
        .publish_did_document(unpublished)
        .with_gas_budget(GAS_BUDGET)
        .build_and_execute(&identity_client)
        .await?
        .output;

    let did_json = serde_json::to_string_pretty(&document)?;
    fs::write(files.did_file, did_json)
        .await
        .with_context(|| format!("failed writing {}", files.did_file))?;

    fs::write(files.fragment_file, &fragment)
        .await
        .with_context(|| format!("failed writing {}", files.fragment_file))?;

    Ok(ActorIdentity { document, fragment })
}

fn open_stronghold_storage(path: &str, password: &str) -> Result<StrongholdDidStorage> {
    let stronghold = StrongholdSecretManager::builder()
        .password(Password::from(password.to_owned()))
        .build(Path::new(path))?;

    let stronghold_storage = StrongholdStorage::new(stronghold);
    let storage = Storage::new(stronghold_storage.clone(), stronghold_storage);
    Ok(storage)
}

async fn build_signed_identity_client<'a>(
    storage: &'a StrongholdDidStorage,
    cfg: &EnvConfig,
) -> Result<SignedIdentityClient<'a>> {
    let generated = storage
        .key_storage()
        .generate(KeyType::new("Ed25519"), JwsAlgorithm::EdDSA)
        .await?;

    let public_key_jwk = generated
        .jwk
        .to_public()
        .ok_or_else(|| anyhow!("public components should be derivable"))?;

    let signer = StorageSigner::new(storage, generated.key_id, public_key_jwk);

    let sender_address = identity_iota::iota_interaction::types::base_types::IotaAddress::from(
        &Signer::public_key(&signer).await?,
    );

    request_funds(&sender_address).await?;

    let iota_client = identity_iota::iota::rebased::utils::get_client(&cfg.api_endpoint).await?;
    let read_only_client =
        identity_iota::iota::rebased::client::IdentityClientReadOnly::new_with_pkg_id(
            iota_client,
            cfg.package_id,
        )
        .await?;

    let identity_client = IdentityClient::new(read_only_client, signer).await?;
    Ok(identity_client)
}

async fn build_read_only_identity_client(
    cfg: &EnvConfig,
) -> Result<identity_iota::iota::rebased::client::IdentityClientReadOnly> {
    let iota_client = identity_iota::iota::rebased::utils::get_client(&cfg.api_endpoint).await?;
    let identity_client = identity_iota::iota::rebased::client::IdentityClientReadOnly::new_with_pkg_id(
        iota_client,
        cfg.package_id,
    )
    .await?;
    Ok(identity_client)
}

#[allow(dead_code)]
fn _type_guards_for_real_api<S, K, I>(_client: &IdentityClient<S>, _storage: &Storage<K, I>)
where
    S: Signer<IotaKeySignature> + OptionalSync,
    K: JwkStorage,
    I: KeyIdStorage,
{
    let _ = KeyIdMemstore::new();
    let _sdk_addr: Option<IotaAddress> = None;
    let _sdk_obj: Option<ObjectID> = None;
}
