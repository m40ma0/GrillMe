from fastapi import FastAPI

app = FastAPI(title="Stage Ready Vision and Media")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"service": "vision", "status": "ok"}
