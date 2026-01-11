"""Round scheduling helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RoundState:
    """State holder for session round scheduling."""

    current_round: int = 0


class RoundScheduler:
    """Round scheduler to advance conversation rounds."""

    def __init__(self, state: RoundState | None = None) -> None:
        """Initialize the scheduler with an optional state."""

        self._state = state or RoundState()

    def start_first_round(self) -> int:
        """Start the first round when a session begins."""

        if self._state.current_round == 0:
            self._state.current_round = 1
        return self._state.current_round

    def advance_round(self) -> int:
        """Advance to the next round."""

        self._state.current_round += 1
        return self._state.current_round

    def current(self) -> int:
        """Return the current round number."""

        return self._state.current_round
