"""Stable cross-module domain error contract."""


class DomainError(ValueError):
    def __init__(self, code: str, status: int = 409):
        self.code, self.status = code, status
        super().__init__(code)
