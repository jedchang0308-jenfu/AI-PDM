resource "google_secret_manager_secret" "candidate_smoke_firebase_refresh_token" {
  project             = var.project_id
  secret_id           = local.candidate_smoke_secret
  deletion_protection = true
  labels              = local.labels

  replication {
    auto {}
  }
}
resource "google_secret_manager_secret_iam_member" "candidate_smoke_refresh_token_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.candidate_smoke_firebase_refresh_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.smoke.email}"
}

resource "google_project_iam_member" "verifier_candidate_smoke_invoker" {
  project = var.project_id
  role    = "roles/workflows.invoker"
  member  = "serviceAccount:${google_service_account.verifier.email}"

  condition {
    title       = "${local.app}_candidate_smoke_only"
    description = "Verifier may execute only its application-owned candidate smoke workflow."
    expression  = "resource.name == 'projects/${var.project_id}/locations/${var.region}/workflows/${local.candidate_smoke_workflow}'"
  }
}

resource "google_workflows_workflow" "candidate_smoke" {
  count                   = var.incident_runtime_enabled ? 1 : 0
  project                 = var.project_id
  region                  = var.region
  name                    = local.candidate_smoke_workflow
  description             = "DEV-012 private zero-traffic candidate smoke for ${local.app}."
  service_account         = google_service_account.smoke.id
  call_log_level          = "LOG_NONE"
  execution_history_level = "EXECUTION_HISTORY_BASIC"
  deletion_protection     = true
  labels                  = local.labels

  source_contents = <<-YAML
    main:
      params: [args]
      steps:
        - init:
            assign:
              - owner_app: $${map.get(args, "ownerApplicationId")}
              - candidate_origin: $${map.get(args, "candidateOrigin")}
              - candidate_tag: $${map.get(args, "candidateTag")}
              - candidate_revision: $${map.get(args, "candidateRevision")}
              - artifact_digest: $${map.get(args, "artifactDigest")}
              - canonical_origin: $${map.get(args, "canonicalOrigin")}
              - firebase_api_key: $${map.get(args, "firebaseApiKey")}
        - validate_target:
            switch:
              - condition: $${owner_app != "${local.app}" or canonical_origin != "https://pdm.jenfu.com.tw" or not(text.match_regex(candidate_tag, "^candidate-[a-f0-9]{12}$")) or not(text.match_regex(candidate_revision, "^ai-pdm-prod-[a-f0-9]{12}$")) or not(text.match_regex(artifact_digest, "${local.candidate_smoke_image_pattern}")) or not(text.match_regex(candidate_origin, "^https://" + candidate_tag + "---ai-pdm-prod-[a-z0-9-]+\\.a\\.run\\.app$")) or not(text.match_regex(firebase_api_key, "^[A-Za-z0-9_-]{20,256}$"))}
                next: reject_target
        - read_refresh_token:
            call: googleapis.secretmanager.v1.projects.secrets.versions.accessString
            args:
              project_id: "${var.project_id}"
              secret_id: "${local.candidate_smoke_secret}"
              version: "${coalesce(var.candidate_smoke_refresh_token_secret_version, "0")}"
            result: refresh_token
        - refresh_id_token:
            call: http.post
            args:
              url: "https://securetoken.googleapis.com/v1/token"
              query:
                key: $${firebase_api_key}
              headers:
                Content-Type: "application/x-www-form-urlencoded"
              body: $${"grant_type=refresh_token&refresh_token=" + text.url_encode(refresh_token)}
              timeout: 20
            result: token_response
        - bind_token:
            assign:
              - id_token: $${map.get(token_response.body, "id_token")}
              - expires_in: $${map.get(token_response.body, "expires_in")}
        - validate_token:
            switch:
              - condition: $${id_token == null or len(id_token) < 100}
                next: reject_token
        - auth_mode:
            call: http.get
            args:
              url: $${candidate_origin + "/api/auth/mode"}
              auth:
                type: OIDC
              timeout: 20
            result: auth_mode_response
        - create_session:
            call: http.post
            args:
              url: $${candidate_origin + "/api/auth/firebase/session"}
              auth:
                type: OIDC
              headers:
                Origin: $${canonical_origin}
                Content-Type: "application/json"
              body:
                idToken: $${id_token}
              timeout: 20
            result: session_response
        - bind_cookie:
            assign:
              - cookie_header: $${default(map.get(session_response.headers, "set-cookie"), map.get(session_response.headers, "Set-Cookie"))}
        - validate_cookie:
            switch:
              - condition: $${cookie_header == null or len(cookie_header) < 10}
                next: reject_session
        - extract_cookie:
            assign:
              - session_cookie: $${text.split(cookie_header, ";")[0]}
        - reload_session:
            call: http.get
            args:
              url: $${candidate_origin + "/api/auth/me"}
              auth:
                type: OIDC
              headers:
                Cookie: $${session_cookie}
              timeout: 20
            result: reload_response
        - authenticated_probe:
            call: http.get
            args:
              url: $${candidate_origin + "${local.candidate_smoke_probe_path}"}
              auth:
                type: OIDC
              headers:
                Cookie: $${session_cookie}
              timeout: 20
            result: authenticated_response
        - init_negative:
            assign:
              - unauthenticated_status: 0
        - unauthenticated_probe:
            try:
              steps:
                - call_unauthenticated_probe:
                    call: http.get
                    args:
                      url: $${candidate_origin + "${local.candidate_smoke_negative_path}"}
                      auth:
                        type: OIDC
                      timeout: 20
                    result: unauthenticated_response
                - capture_unexpected_unauthenticated:
                    assign:
                      - unauthenticated_status: $${unauthenticated_response.code}
            except:
              as: unauthenticated_error
              steps:
                - reject_unexpected_unauthenticated_error:
                    switch:
                      - condition: $${not("HttpError" in unauthenticated_error.tags and unauthenticated_error.code == 401)}
                        raise: $${unauthenticated_error}
                - capture_expected_unauthenticated:
                    assign:
                      - unauthenticated_status: $${unauthenticated_error.code}
        - validate_unauthenticated:
            switch:
              - condition: $${unauthenticated_status != 401}
                next: reject_unauthenticated
        - logout:
            call: http.post
            args:
              url: $${candidate_origin + "/api/auth/logout"}
              auth:
                type: OIDC
              headers:
                Origin: $${canonical_origin}
                Cookie: $${session_cookie}
                Content-Type: "application/json"
              body: {}
              timeout: 20
            result: logout_response
        - init_revoked:
            assign:
              - revoked_status: 0
        - revoked_probe:
            try:
              steps:
                - call_revoked_probe:
                    call: http.get
                    args:
                      url: $${candidate_origin + "/api/auth/me"}
                      auth:
                        type: OIDC
                      headers:
                        Cookie: $${session_cookie}
                      timeout: 20
                    result: revoked_response
                - capture_unexpected_revoked:
                    assign:
                      - revoked_status: $${revoked_response.code}
            except:
              as: revoked_error
              steps:
                - reject_unexpected_revoked_error:
                    switch:
                      - condition: $${not("HttpError" in revoked_error.tags and revoked_error.code == 401)}
                        raise: $${revoked_error}
                - capture_expected_revoked:
                    assign:
                      - revoked_status: $${revoked_error.code}
        - validate_revoked:
            switch:
              - condition: $${revoked_status != 401}
                next: reject_revoked
        - return_pass:
            return:
              schemaVersion: "jenfu.dev012.internal-candidate-smoke.v1"
              ownerApplicationId: $${owner_app}
              candidateRevision: $${candidate_revision}
              artifactDigest: $${artifact_digest}
              tokenSource: "SECRET_MANAGER_EXACT_VERSION"
              tokenExpiresInSeconds: $${expires_in}
              observations:
                - id: "auth-mode"
                  status: $${auth_mode_response.code}
                - id: "session-create"
                  status: $${session_response.code}
                - id: "session-reload"
                  status: $${reload_response.code}
                - id: "authenticated-probe"
                  status: $${authenticated_response.code}
                - id: "unauthenticated-probe"
                  status: $${unauthenticated_status}
                - id: "session-revoked"
                  status: $${revoked_status}
              status: "PASS"
        - reject_target:
            raise: "DEV012_SMOKE_TARGET_INVALID"
        - reject_token:
            raise: "DEV012_SMOKE_TOKEN_INVALID"
        - reject_session:
            raise: "DEV012_SMOKE_SESSION_INVALID"
        - reject_unauthenticated:
            raise: "DEV012_SMOKE_UNAUTHENTICATED_EXPECTATION_FAILED"
        - reject_revoked:
            raise: "DEV012_SMOKE_REVOCATION_FAILED"
  YAML

  depends_on = [
    google_secret_manager_secret_iam_member.candidate_smoke_refresh_token_accessor,
    google_cloud_run_v2_service_iam_member.application_smoke,
  ]
}
