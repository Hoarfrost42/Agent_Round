"""Templates API routes for managing chat and prompt templates."""

from pathlib import Path
from typing import Dict, Any

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/templates", tags=["templates"])

# Config file path
CONFIG_DIR = Path(__file__).parent.parent.parent.parent / "config"
TEMPLATES_FILE = CONFIG_DIR / "templates.yaml"


class TemplateItem(BaseModel):
    name: str
    icon: str | None = None
    content: str


class TemplatesResponse(BaseModel):
    chat_templates: Dict[str, TemplateItem]
    prompt_templates: Dict[str, TemplateItem]


def load_templates() -> dict:
    """Load templates from YAML file."""
    if not TEMPLATES_FILE.exists():
        return {"chat_templates": {}, "prompt_templates": {}}
    
    with open(TEMPLATES_FILE, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    
    return {
        "chat_templates": data.get("chat_templates", {}),
        "prompt_templates": data.get("prompt_templates", {})
    }


def save_templates(data: dict):
    """Save templates to YAML file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


@router.get("", response_model=TemplatesResponse)
async def get_templates():
    """Get all templates."""
    return load_templates()


@router.get("/chat")
async def get_chat_templates():
    """Get chat input templates."""
    data = load_templates()
    return data.get("chat_templates", {})


@router.get("/prompt")
async def get_prompt_templates():
    """Get system prompt templates."""
    data = load_templates()
    return data.get("prompt_templates", {})


@router.put("/chat/{template_id}")
async def save_chat_template(template_id: str, template: TemplateItem):
    """Save or update a chat template."""
    data = load_templates()
    data["chat_templates"][template_id] = template.model_dump()
    save_templates(data)
    return {"status": "ok", "id": template_id}


@router.put("/prompt/{template_id}")
async def save_prompt_template(template_id: str, template: TemplateItem):
    """Save or update a prompt template."""
    data = load_templates()
    data["prompt_templates"][template_id] = template.model_dump()
    save_templates(data)
    return {"status": "ok", "id": template_id}


@router.delete("/chat/{template_id}")
async def delete_chat_template(template_id: str):
    """Delete a chat template."""
    data = load_templates()
    if template_id in data.get("chat_templates", {}):
        del data["chat_templates"][template_id]
        save_templates(data)
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Template not found")


@router.delete("/prompt/{template_id}")
async def delete_prompt_template(template_id: str):
    """Delete a prompt template."""
    data = load_templates()
    if template_id in data.get("prompt_templates", {}):
        del data["prompt_templates"][template_id]
        save_templates(data)
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Template not found")


@router.post("/reset")
async def reset_templates():
    """Reset templates to default (reload from example or empty)."""
    example_file = CONFIG_DIR / "templates.example.yaml"
    if example_file.exists():
        with open(example_file, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        save_templates(data)
        return {"status": "ok", "message": "Reset to example templates"}
    
    # If no example, just return current
    return {"status": "ok", "message": "No example file found"}
