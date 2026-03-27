from __future__ import annotations


class GpaManagerError(Exception):
    """Base exception for the GPA manager backend."""


class ValidationError(GpaManagerError):
    """Raised when an input violates domain rules."""


class NotFoundError(GpaManagerError):
    """Raised when an entity cannot be found."""


class DuplicateCourseError(GpaManagerError):
    """Raised when a course would duplicate an existing course name/semester pair."""
