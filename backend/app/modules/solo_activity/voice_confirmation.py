"""Voice mode: what the student's spoken answer to a summary read to them does.

Voice has no confirmation rules of its own: the answer only picks which of the two actions the
backend offers at that point is pressed, 對 (``confirm_viewpoint`` / ``submit_reflection``) or
不太對 (``revise_viewpoint`` / ``continue_reflection``), exactly as the student would on the card.
Only an agreement to a summary whose meaning reached the student intact confirms; everything else
keeps the discussion going, up to the limits the state machine already has. Pure: no I/O.
"""

from __future__ import annotations

from typing import Literal

# What the student meant (voice_judge: the model's verdict, the word list as fallback and check).
Verdict = Literal["agree", "disagree", "addition", "unclear"]

# confirm: as 對. not_confirmed: as 不太對, the discussion goes on with the answer. ask_again: the
# question is asked once more. read_again: the summary is read once more. withdraw: the summary
# never reached the student intact; it is taken back without counting as 不太對.
Decision = Literal["confirm", "not_confirmed", "ask_again", "read_again", "withdraw"]

# Answers that could not be judged are asked once more; the second one is a failed confirmation.
ASKS = 1
# A reading that bent the summary is read once more; the second one is withdrawn.
READS = 1


def decide(verdict: Verdict, *, faithful: bool, vetoed: bool, asks: int, reads: int) -> Decision:
    """``faithful``: what the student heard kept the summary's meaning and was not cut off.
    ``vetoed``: the word list heard a plain no where the model heard a yes.
    ``asks``/``reads``: how many times the question/the summary has already been said again.
    """
    if not faithful:
        return "read_again" if reads < READS else "withdraw"
    if verdict == "agree" and not vetoed:
        return "confirm"
    if verdict in ("disagree", "addition"):
        return "not_confirmed"
    # Unclear, or a yes the student's own words contradict: judged twice, it is not a confirmation.
    return "ask_again" if asks < ASKS else "not_confirmed"
