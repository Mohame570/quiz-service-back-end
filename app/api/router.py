from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "quiz-service-backend",
    }
