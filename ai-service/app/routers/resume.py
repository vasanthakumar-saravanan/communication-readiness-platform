"""Resume parsing endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.resume_parser import get_resume_parser

router = APIRouter(prefix="/resume", tags=["resume"])


class ResumeSkills(BaseModel):
    languages: list[str] = []
    frameworks: list[str] = []
    databases: list[str] = []
    tools: list[str] = []


class ResumeProject(BaseModel):
    title: str
    description: str
    techStack: list[str] = []


class ResumeParseResponse(BaseModel):
    # Frontend ParsedResume fields
    fileName: str
    parsedAt: str
    summary: str | None = None
    skills: ResumeSkills
    projects: list[ResumeProject] = []
    # Extended interview engine fields
    name: str | None = None
    email: str | None = None
    education: list[Any] = []
    experience: list[Any] = []
    certifications: list[Any] = []
    achievements: list[Any] = []
    # Raw text for AI interview context
    text: str = ""


@router.post("/parse", response_model=ResumeParseResponse)
async def parse_resume(file: UploadFile = File(...)):
    """
    Extract and structure resume data from an uploaded PDF or DOCX.

    Returns a structured JSON payload with:
    - fileName, parsedAt, summary, skills, projects (frontend ParsedResume shape)
    - name, email, education, experience, certifications, achievements (interview context)
    - text: full raw extracted text (used for resume_context in question generation)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith(".pdf") or filename_lower.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    try:
        file_bytes = await file.read()
        parser = get_resume_parser()
        result = parser.parse_resume(file_bytes, filename=file.filename)
        return ResumeParseResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")
