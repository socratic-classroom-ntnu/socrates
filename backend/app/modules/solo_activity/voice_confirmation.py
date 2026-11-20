"""Voice mode: what the student's spoken answer to a read-out summary does.

In voice mode the summary is read aloud and the student answers in speech; a classifier sorts the
answer (``VoiceAnswer``) and ``decide`` turns it into one step for the state machine. Only an
explicit agreement to a summary heard to the end confirms; everything else keeps the dialogue
going. Pure: no I/O, no clock.
"""

from __future__ import annotations

from typing import Literal

# What the classifier says the student meant.
VoiceAnswer = Literal["agree", "disagree", "addition", "unclear"]

# confirm: as 對. revise: as 不太對, the answer goes on as the next message. withdraw: the summary
# is taken back without counting as 不太對, the answer goes on as an ordinary message. ask_again:
# the question (or, when it was not heard in full, the summary) is read once more. show_card:
# voice cannot settle it, the student presses the card as when typing.
Decision = Literal["confirm", "revise", "withdraw", "ask_again", "show_card"]

# Unclear answers asked again before the answer counts as not confirmed.
UNCLEAR_ASKS = 1


def decide(
    answer: VoiceAnswer,
    *,
    heard_in_full: bool,
    unclear_asks: int,
    can_still_talk: bool,
) -> Decision:
    """``heard_in_full``: the read-out was not interrupted and matched the summary word for word.
    ``unclear_asks``: how many times the question has already been asked again for this summary.
    ``can_still_talk``: the student has a message left in the scenario (only 對 is offered else).
    """
    if not can_still_talk:
        # Only an agreement can move on; anything else is asked again, then handed to the card.
        if heard_in_full and answer == "agree":
            return "confirm"
        return "ask_again" if unclear_asks < UNCLEAR_ASKS else "show_card"
    if not heard_in_full:
        return "withdraw"
    if answer == "agree":
        return "confirm"
    if answer == "disagree":
        return "revise"
    if answer == "unclear" and unclear_asks < UNCLEAR_ASKS:
        return "ask_again"
    return "withdraw"
