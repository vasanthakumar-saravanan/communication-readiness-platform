"""Resume parsing service using PyMuPDF for PDF and python-docx for DOCX, with LLM for structured data."""

from __future__ import annotations

import datetime
import json
from typing import Any

import fitz  # PyMuPDF
from docx import Document  # python-docx

# Prompt for LLM-based structured extraction
_EXTRACT_PROMPT = """Extract structured information from this resume text. Return ONLY valid JSON with no extra text or markdown.

Resume text:
{text}

Required JSON structure:
{{
  "name": "candidate full name or null",
  "email": "email address or null",
  "summary": "2-3 sentence professional summary based on the resume, or null",
  "education": [
    {{"institution": "university/college name", "degree": "degree type", "field": "field of study", "year": "graduation year or range"}}
  ],
  "skills": {{
    "languages": ["programming languages explicitly listed"],
    "frameworks": ["frameworks, libraries explicitly listed"],
    "databases": ["databases explicitly listed"],
    "tools": ["tools, cloud platforms, DevOps explicitly listed"]
  }},
  "projects": [
    {{
      "title": "project name",
      "description": "1-2 sentence description of what the project does",
      "techStack": ["technology1", "technology2"]
    }}
  ],
  "experience": [
    {{"company": "company name", "role": "job title", "duration": "date range", "description": "brief description"}}
  ],
  "certifications": ["certification name"],
  "achievements": ["notable achievement or award"]
}}

Rules:
- Use null for missing string fields, empty arrays [] for missing list fields. Do NOT invent data.
- For skills, ONLY include technologies explicitly mentioned in the resume text.
- Extract ALL projects with their actual tech stack from the resume.
- Output ONLY the JSON object, no markdown fences, no explanation."""


def _llm_extract(raw_text: str) -> dict[str, Any]:
    """Use the LLM client to extract structured resume data from raw text."""
    try:
        from app.services.llm_client import get_llm_client
        client = get_llm_client()
        prompt = _EXTRACT_PROMPT.format(text=raw_text[:8000])  # cap at 8k chars to stay within token limits
        result = client._call_json(prompt, max_tokens=2048)
        return result
    except Exception as exc:
        # Log but do not re-raise; caller will use empty-field fallback
        import logging
        logging.getLogger(__name__).warning("LLM resume extraction failed: %s", exc)
        return {}


def _safe_list(value: Any) -> list:
    """Return value if it's a list, else empty list."""
    return value if isinstance(value, list) else []


def _safe_str(value: Any) -> str | None:
    """Return stripped string or None."""
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _safe_dict(value: Any) -> dict:
    """Return value if it's a dict, else empty dict."""
    return value if isinstance(value, dict) else {}


class ResumeParser:
    """Extract text from PDF/DOCX and structured data via LLM."""

    def _extract_text_from_pdf(self, file_bytes: bytes) -> str:
        """Extract text from PDF using PyMuPDF."""
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        full_text_parts: list[str] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            full_text_parts.append(page.get_text())

        raw_text = "\n\n".join(full_text_parts).strip()
        doc.close()
        return raw_text

    def _extract_text_from_docx(self, file_bytes: bytes) -> str:
        """Extract text from DOCX using python-docx."""
        from io import BytesIO
        doc = Document(BytesIO(file_bytes))
        paragraphs = [para.text for para in doc.paragraphs if para.text.strip()]
        return "\n\n".join(paragraphs).strip()

    def parse_resume(self, file_bytes: bytes, filename: str = "resume.pdf") -> dict[str, Any]:
        """
        Extract text and structured resume data from a PDF or DOCX.

        Args:
            file_bytes: file content as bytes
            filename: original filename (used to determine file type)

        Returns:
            Structured dictionary containing both raw text and LLM-extracted fields.
        """
        # Determine file type from filename
        filename_lower = filename.lower()
        if filename_lower.endswith(".pdf"):
            raw_text = self._extract_text_from_pdf(file_bytes)
        elif filename_lower.endswith(".docx"):
            raw_text = self._extract_text_from_docx(file_bytes)
        else:
            raise ValueError(f"Unsupported file type: {filename}")

        # LLM-based structured extraction (graceful fallback on failure)
        structured = _llm_extract(raw_text) if raw_text else {}

        skills_raw = _safe_dict(structured.get("skills"))
        projects_raw = _safe_list(structured.get("projects"))

        # Normalise projects to frontend ParsedResume shape
        normalised_projects = []
        for p in projects_raw:
            if not isinstance(p, dict):
                continue
            normalised_projects.append({
                "title": _safe_str(p.get("title") or p.get("name")) or "Untitled Project",
                "description": _safe_str(p.get("description")) or "",
                "techStack": _safe_list(p.get("techStack") or p.get("technologies") or p.get("tech_stack")),
            })

        return {
            # ── Frontend ParsedResume fields ──
            "fileName": filename,
            "parsedAt": datetime.date.today().isoformat(),
            "summary": _safe_str(structured.get("summary")),
            "skills": {
                "languages": _safe_list(skills_raw.get("languages")),
                "frameworks": _safe_list(skills_raw.get("frameworks")),
                "databases": _safe_list(skills_raw.get("databases")),
                "tools": _safe_list(skills_raw.get("tools")),
            },
            "projects": normalised_projects,
            # ── Extended fields (used by AI interview engine) ──
            "name": _safe_str(structured.get("name")),
            "email": _safe_str(structured.get("email")),
            "education": _safe_list(structured.get("education")),
            "experience": _safe_list(structured.get("experience")),
            "certifications": _safe_list(structured.get("certifications")),
            "achievements": _safe_list(structured.get("achievements")),
            # ── Raw text (interview.routes.ts reads parsed_resume.text) ──
            "text": raw_text,
        }


def get_resume_parser() -> ResumeParser:
    """Get resume parser instance."""
    return ResumeParser()
