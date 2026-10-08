from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.interview import router as interview_router
from app.routers.learning import router as learning_router
from app.routers.agent import router as agent_router
from app.routers.internal import router as internal_router
from app.routers.resume import router as resume_router

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(interview_router)
app.include_router(learning_router)
app.include_router(agent_router)
app.include_router(internal_router)
app.include_router(resume_router)


@app.on_event("startup")
def startup_event() -> None:
    import os
    # Initialise Redis connection eagerly so startup logs reflect Redis health.
    from app.cache.redis_client import get_redis
    get_redis()

    # Log provider info safely — never print the actual API key.
    from app.services.llm_client import get_llm_client
    llm = get_llm_client()
    provider_name = type(llm._provider).__name__
    key_configured = bool(os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY"))
    print(f"[startup] LLM provider: {provider_name}", flush=True)
    print(f"[startup] GROQ_API_KEY configured: {key_configured}", flush=True)

    try:
        from app.agents.agent_runner import recover_dead_runs
        recovered = recover_dead_runs()
        if recovered:
            print(f"[startup] Recovered {len(recovered)} dead agent run(s): {recovered}", flush=True)
    except Exception as e:
        print(f"[startup] recoverDeadRuns error: {e}", flush=True)


@app.on_event("shutdown")
def shutdown_event() -> None:
    from app.cache.redis_client import close_redis
    close_redis()


@app.get("/health")
def health() -> dict:
    from app.services.llm_client import get_llm_client
    from app.cache.redis_client import get_redis
    from app.workers.queue import get_job_queue
    provider  = type(get_llm_client()).__name__
    redis_ok  = False
    queue_depth = None
    try:
        r = get_redis()
        redis_ok = r is not None and bool(r.ping())
    except Exception:
        pass
    try:
        q = get_job_queue()
        if q is not None:
            queue_depth = len(q)
    except Exception:
        pass
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "llm_provider": provider,
        "redis_cache": "connected" if redis_ok else "disabled",
        "queue_depth": queue_depth,
    }
