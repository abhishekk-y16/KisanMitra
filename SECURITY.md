# Kisan-Mitra Security Configuration
# VPC Service Controls and Security Guidelines

## VPC-SC Ingress Rules (terraform/gcloud)

# Create a service perimeter for Kisan-Mitra
# gcloud access-context-manager perimeters create kisan-mitra-perimeter \
#   --title="Kisan-Mitra Security Perimeter" \
#   --resources=projects/<PROJECT_NUMBER> \
#   --restricted-services=storage.googleapis.com,aiplatform.googleapis.com \
#   --policy=<POLICY_ID>

# Allow Vertex AI Reasoning Engine to access storage
ingress_policies:
  - ingress_from:
      identities:
        - serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-aiplatform-re.iam.gserviceaccount.com
      sources:
        - access_level: "*"
    ingress_to:
      operations:
        - service_name: storage.googleapis.com
          method_selectors:
            - method: "*"
        - service_name: artifactregistry.googleapis.com
          method_selectors:
            - method: "*"
      resources:
        - projects/<PROJECT_NUMBER>

## Firestore / Storage Security Rules

# Firestore rules (if using Firestore for sync)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can read/write their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Diagnoses are user-scoped
    match /diagnoses/{diagId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}

## Environment Variables Required

# Backend (.env)
CEDA_BASE=https://api.ceda.ashoka.edu.in/v1
ANTHROKRISHI_GWCID=<your-google-workspace-customer-id>
ANTHROKRISHI_DEV_EMAIL=<your-allowlisted-email>
EARTH_ENGINE_SERVICE_ACCOUNT=<service-account-json-path>
CIBRC_RAG_INDEX=<vertex-ai-search-index-id>

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=https://api.kisanmitra.in
NEXT_PUBLIC_INDICTRANS_API=https://indictrans.kisanmitra.in/translate

## Data Encryption at Rest

# IndexedDB: Uses Web Crypto API with AES-256-GCM (implemented in syncEngine.ts)
# Key derivation: PBKDF2 or stored raw key with secure rotation policy

# SQLite (if using Capacitor/native): Use SQLCipher
# Example: PRAGMA key = 'your-256-bit-key';

## API Security Headers

# Add to FastAPI middleware:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - Content-Security-Policy: default-src 'self'
# - Strict-Transport-Security: max-age=31536000; includeSubDomains

## Rate Limiting

# Implement per-user rate limits:
# - Vision API: 10 requests/minute
# - Market API: 30 requests/minute
# - General: 100 requests/minute

## Audit Logging

# Enable Cloud Audit Logs for:
# - Data access (BigQuery, Storage)
# - Admin activity
# - System events

# Log all API calls with:
# - User ID (if authenticated)
# - Timestamp
# - Request path
# - Response status
# - Location (anonymized)
