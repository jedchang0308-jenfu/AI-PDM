# Release Handler (Google Cloud Function)

This directory contains the Google Cloud Function responsible for securely publishing engineering drawings within Google Drive.

## Features
1. **Secure Execution**: Operates under a high-privilege Service Account (Release Service Account) to perform writes and file moves.
2. **Token Authentication**: Implements bearer-token validation (`API_TOKEN`) to prevent unauthorized access.
3. **Robust Idempotency**: Automatically checks if files are already released with matching metadata, making retries/failures completely safe.
4. **Comprehensive Metadata Writing**: Sets Google Drive `appProperties` (including `Status`, `SubmissionId`, `DrawingNumber`, `Revision`, `ApprovedBy`, `ApprovedAt`) on ALL drawing formats.

---

## Local Development & Testing

### 1. Installation
Install the dependencies:
```bash
npm install
```

### 2. Set Up Credentials
Since this function uses Google Application Default Credentials (ADC), you must set the environment variable pointing to your Google Service Account key file:
- On Linux/macOS:
  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json"
  ```
- On Windows (PowerShell):
  ```powershell
  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\sa-key.json"
  ```

### 3. Run Locally
Run the Functions Framework dev server:
```bash
# Start server on http://localhost:8080
npm run dev
```

### 4. Test Triggering (Local API request)
Set the secret api token in your shell or env:
- On Windows (PowerShell):
  ```powershell
  $env:API_TOKEN="your_secret_token"
  npm run dev
  ```

Send a sample POST request:
```bash
curl -X POST http://localhost:8080 \
  -H "Authorization: Bearer your_secret_token" \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "SUB-20260515-0001",
    "approvedBy": "reviewer-id",
    "drawingNumber": "A-100",
    "revision": "B",
    "files": [
      { "fileRole": "pdf", "gdriveFileId": "GDRIVE_FILE_ID_HERE", "originalFilename": "A-100_B.pdf" }
    ],
    "pendingFolderId": "PENDING_FOLDER_ID",
    "releasedFolderId": "RELEASED_FOLDER_ID",
    "approvedAt": "2026-05-22T13:30:00Z"
  }'
```

---

## Deployment to GCP

Deploy to Google Cloud Functions (2nd Gen) with the following gcloud command:

```bash
gcloud functions deploy release-handler \
  --gen2 \
  --runtime=nodejs20 \
  --region=asia-east1 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point=releaseHandler \
  --set-env-vars="API_TOKEN=your_secure_shared_secret" \
  --service-account="your-release-service-account@your-project.iam.gserviceaccount.com"
```
