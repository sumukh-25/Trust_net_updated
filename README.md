# TrustNet AI Guardian

TrustNet is a local security-monitoring demo with a React dashboard and a FastAPI service for login risk analysis, device trust, incidents, request monitoring, and synthetic attack simulation. It is not production security software.

## Run locally

Prerequisites: Python 3.10+, Node.js 18+, and npm. The backend and frontend run as separate processes.

Install frontend dependencies from the repository root:

```powershell
npm install
```

Start the backend in one terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8010
```

Start the frontend in another terminal, from the repository root:

```powershell
npm run dev
```

Vite listens on `http://localhost:8080`; the API and OpenAPI docs are at `http://localhost:8010/api/health` and `http://localhost:8010/docs`.

Model training runs during backend startup. Set `TRUSTNET_DB_PATH` to choose a different SQLite file and `TRUSTNET_JWT_SECRET` to provide a stable signing secret. Without the JWT setting, a random secret is generated for each process start.

**Demo credentials:** Before sharing or deploying this application, remove or change the seeded demo admin credentials. Never expose default credentials in a public deployment.

## Verify

From the backend directory:

```powershell
python -m unittest test_backend_api -v
```

From the repository root:

```powershell
npm run test
npm run build
python test_ml_models.py
python backend/evaluate_synthetic.py
```

The Python evaluation checks use fictional synthetic records. Their metrics are reproducible demonstration measurements, not real-world detection accuracy.

See [docs/STATUS.md](docs/STATUS.md) for current implementation limitations and verification status.

## Security notice

This is a development and demonstration project, not production-ready security software. Do not commit `.env` files, secrets, passwords, or private data.
