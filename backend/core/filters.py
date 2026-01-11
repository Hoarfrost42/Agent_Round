"""Text filtering helpers for model outputs."""

from __future__ import annotations

import re


THOUGHT_TAGS = ("think", "analysis", "reasoning", "thought", "chain-of-thought", "cot")

_TAG_PATTERN = re.compile(
    r"<(?P<tag>{tags})>.*?</(?P=tag)>".format(tags="|".join(THOUGHT_TAGS)),
    re.IGNORECASE | re.DOTALL,
)
_CODE_BLOCK_PATTERN = re.compile(
    r"```(?P<tag>{tags})\b.*?```".format(tags="|".join(THOUGHT_TAGS)),
    re.IGNORECASE | re.DOTALL,
)


def filter_thoughts(text: str) -> str:
    """Remove chain-of-thought style blocks from model output."""

    if not text:
        return text
    cleaned = _TAG_PATTERN.sub("", text)
    cleaned = _CODE_BLOCK_PATTERN.sub("", cleaned)
    cleaned = cleaned.replace("<think>", "").replace("</think>", "")
    return cleaned.strip()
