# Deploying backend to Render

Steps to deploy the backend service to Render (using the existing `Dockerfile` in `backend/`):

1. Push your repository to GitHub (if not already).

2. Open Render (https://render.com) and create a new **Web Service**.
   - Connect your GitHub account and select this repository.
   - For **Root Directory**, set: `backend` (so Render uses the `backend/Dockerfile`).
   - For **Environment**, choose `Docker` (Render will build the Dockerfile).
   - Set the **Build Command** empty (Dockerfile handles build), and the **Start Command** can be left blank when using Dockerfile (the `CMD` in Dockerfile runs uvicorn).
   - Set the port to `8080` (Render will detect it, but ensure the health check uses `/healthz`).

3. Add Environment Variables (Render → Environment → Environment Variables): copy values from `backend/.env.example` and provide production values for at least:
   - `JWT_SECRET` (strong random secret)
   - `GEMINI_API_KEY` (if using Gemini integrations)
   - `WEATHER_API_KEY`
   - `CEDA_API_KEY` (if used)
   - `EARTH_ENGINE_SERVICE_ACCOUNT` (if using Earth Engine; provide service-account JSON content as a secret or point to secret storage)

4. (Optional) If you prefer not to use Docker, you can create a Python Web Service on Render and set the following:
   - Runtime: Python 3.11
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port 8080`

5. Configure health check path: `/healthz`. Monitor deployment logs for build and runtime errors.

6. Once deployed, you'll have a public backend URL (e.g. `https://your-service.onrender.com`). Copy that URL and add it as a GitHub secret named `BACKEND_URL` in your repository settings (for frontend builds).

7. In Render, ensure storage for uploaded images persists if needed: the current `upload_image` endpoint saves files to `backend/tmp_uploads` and serves them under `/static/tmp_uploads`. For persistence across deploys, you should configure external object storage (S3) or Render Volumes.

8. After deployment, test:
   - `GET https://<your-render-url>/healthz` → should return `{"status":"ok"}`
   - Frontend should be configured with `NEXT_PUBLIC_API_URL` pointing at this Render URL.

   Additional optional automation (CI):

   - You can enable a GitHub Actions workflow to build and push the backend Docker image to GitHub Container Registry (GHCR). A sample workflow is provided at `.github/workflows/backend-docker.yml` which will:
      - Build the Docker image from the `backend/` folder and push tags `latest` and `${{ github.sha }}` to `ghcr.io/<your-org>/kisanbuddy-backend`.
      - Optionally trigger a Render deploy if you configure two GitHub secrets: `RENDER_API_KEY` and `RENDER_SERVICE_ID`.

   GitHub secrets required for full automation:
   - `BACKEND_URL` — the public URL of your Render service (used by the frontend workflow).
   - `RENDER_API_KEY` — Render API key (if you want GH Actions to trigger Render deploys).
   - `RENDER_SERVICE_ID` — the Render service id to trigger deploys (if using the API trigger).

   How to set those secrets:
   1. On GitHub, go to your repository → Settings → Secrets and variables → Actions → New repository secret.
   2. Add each secret name and its value (paste Render API key, service id, or URL).

   Once these are set, pushing to `main` will build/push the backend image and, if configured, tell Render to deploy the new image.
