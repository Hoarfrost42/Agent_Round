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


class StreamingThoughtFilter:
    """Incremental thought filter for streaming outputs."""

    def __init__(self, tags: tuple[str, ...] = THOUGHT_TAGS) -> None:
        """Initialize the streaming filter state."""

        self._tags = tuple(tag.lower() for tag in tags)
        self._inside_tag: str | None = None
        self._inside_code: str | None = None
        self._buffer = ""
        max_tag = max(len(tag) for tag in self._tags)
        self._max_marker_len = max(len("</>") + max_tag, len("```") + max_tag, 6)

    def feed(self, chunk: str) -> str:
        """Consume a chunk and return safe output outside thought tags."""

        if not chunk and not self._buffer:
            return ""
        text = f"{self._buffer}{chunk}"
        lower_text = text.lower()
        output: list[str] = []
        index = 0

        while index < len(text):
            if self._inside_code:
                close_index = lower_text.find("```", index)
                if close_index == -1:
                    self._buffer = text[max(index, len(text) - 2) :]
                    return "".join(output)
                index = close_index + 3
                self._inside_code = None
                continue

            if self._inside_tag:
                close_tag = f"</{self._inside_tag}>"
                close_index = lower_text.find(close_tag, index)
                if close_index == -1:
                    self._buffer = text[max(index, len(text) - len(close_tag) + 1) :]
                    return "".join(output)
                index = close_index + len(close_tag)
                self._inside_tag = None
                continue

            next_index = len(text)
            next_kind: str | None = None
            next_tag: str | None = None
            for tag in self._tags:
                open_tag = f"<{tag}>"
                code_tag = f"```{tag}"
                open_index = lower_text.find(open_tag, index)
                if open_index != -1 and open_index < next_index:
                    next_index = open_index
                    next_kind = "tag"
                    next_tag = tag
                code_index = lower_text.find(code_tag, index)
                if code_index != -1 and code_index < next_index:
                    next_index = code_index
                    next_kind = "code"
                    next_tag = tag

            if next_kind is None or next_tag is None:
                safe_end = max(index, len(text) - self._max_marker_len + 1)
                output.append(text[index:safe_end])
                self._buffer = text[safe_end:]
                return "".join(output)

            if next_index > index:
                output.append(text[index:next_index])

            if next_kind == "tag":
                index = next_index + len(f"<{next_tag}>")
                self._inside_tag = next_tag
            else:
                index = next_index + len(f"```{next_tag}")
                self._inside_code = next_tag

        self._buffer = ""
        return "".join(output)

    def flush(self) -> str:
        """Flush remaining buffered content at stream end."""

        if self._inside_tag or self._inside_code:
            self._buffer = ""
            return ""
        remaining = self._buffer
        self._buffer = ""
        return remaining
